import { Express } from "express";
import fs from "fs";
import path from "path";
import { cleanupFile } from "./ytdlp";

/**
 * Store active downloads in memory with expiration
 */
const activeDownloads = new Map<string, { filePath: string; expiresAt: number }>();

// Clean up expired downloads every minute
setInterval(() => {
  const now = Date.now();
  const keysToDelete: string[] = [];
  activeDownloads.forEach((value, key) => {
    if (value.expiresAt < now) {
      cleanupFile(value.filePath);
      keysToDelete.push(key);
    }
  });
  keysToDelete.forEach((key) => activeDownloads.delete(key));
}, 60000);

/**
 * Register a download token that can be used to retrieve a file
 */
export function registerDownload(filePath: string): string {
  const token = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  // Token expires in 15 minutes (optimized for mobile users)
  activeDownloads.set(token, {
    filePath,
    expiresAt: Date.now() + 15 * 60 * 1000,
  });
  return token;
}

/**
 * Register download routes with Express
 */
export function registerDownloadRoutes(app: Express) {
  app.get("/api/download/:token", (req, res) => {
    const { token } = req.params;

    const download = activeDownloads.get(token);
    if (!download) {
      return res.status(404).json({ error: "Download not found or expired" });
    }

    const { filePath } = download;

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      activeDownloads.delete(token);
      return res.status(404).json({ error: "File not found" });
    }

    try {
      const filename = path.basename(filePath);
      const fileSize = fs.statSync(filePath).size;

      // Set response headers for file download
      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Content-Length", fileSize);
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");

      // Stream the file
      const fileStream = fs.createReadStream(filePath);

      fileStream.on("end", () => {
        // Clean up after successful download
        activeDownloads.delete(token);
        cleanupFile(filePath);
      });

      fileStream.on("error", (error) => {
        console.error("File stream error:", error);
        activeDownloads.delete(token);
        cleanupFile(filePath);
        if (!res.headersSent) {
          res.status(500).json({ error: "Download failed" });
        }
      });

      fileStream.pipe(res);
    } catch (error) {
      console.error("Download handler error:", error);
      activeDownloads.delete(token);
      cleanupFile(filePath);
      res.status(500).json({ error: "Download failed" });
    }
  });
}
