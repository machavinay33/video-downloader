import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs";
import os from "os";

const execAsync = promisify(exec);

export function detectPlatform(url: string): string {
  const urlLower = url.toLowerCase();
  if (urlLower.includes("instagram.com") || urlLower.includes("instagr.am")) return "Instagram";
  if (urlLower.includes("youtube.com") || urlLower.includes("youtu.be")) return "YouTube";
  if (urlLower.includes("tiktok.com")) return "TikTok";
  if (urlLower.includes("twitter.com") || urlLower.includes("x.com")) return "Twitter/X";
  if (urlLower.includes("facebook.com") || urlLower.includes("fb.watch")) return "Facebook";
  if (urlLower.includes("reddit.com")) return "Reddit";
  if (urlLower.includes("vimeo.com")) return "Vimeo";
  if (urlLower.includes("dailymotion.com")) return "Dailymotion";
  return "Unknown";
}

function isInstagramUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return lower.includes("instagram.com") || lower.includes("instagr.am");
}

function writeInstagramCookieFile(): string | null {
  const sessionId = process.env.INSTAGRAM_SESSION_ID;
  if (!sessionId) return null;
  const cookiePath = path.join(os.tmpdir(), "instagram_cookies.txt");
  const cookieContent = [
    "# Netscape HTTP Cookie File",
    "",
    `.instagram.com\tTRUE\t/\tTRUE\t9999999999\tsessionid\t${sessionId}`,
    `.instagram.com\tTRUE\t/\tTRUE\t9999999999\tds_user_id\t0`,
    `.instagram.com\tTRUE\t/\tTRUE\t9999999999\tcsrftoken\txxxxxx`,
  ].join("\n");
  fs.writeFileSync(cookiePath, cookieContent, "utf-8");
  return cookiePath;
}

function instagramFlags(): string {
  const cookiePath = writeInstagramCookieFile();
  const ua =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) " +
    "AppleWebKit/605.1.15 (KHTML, like Gecko) " +
    "Version/17.0 Mobile/15E148 Safari/604.1";
  let flags =
    `--user-agent "${ua}" ` +
    `--add-header "Accept-Language:en-US,en;q=0.9" ` +
    `--add-header "Referer:https://www.instagram.com/" ` +
    `--no-check-certificate ` +
    `--extractor-args "instagram:api=graphql" `;
  if (cookiePath) flags += `--cookies "${cookiePath}" `;
  return flags;
}

export interface VideoFormat {
  formatId: string;
  ext: string;
  resolution: string;
  fps?: number;
  codec?: string;
  bitrate?: string;
}

export interface VideoMetadata {
  id: string;
  title: string;
  duration: number;
  thumbnail: string;
  formats: VideoFormat[];
  audioFormats: string[];
}

function parseYtDlpInfo(info: Record<string, unknown>): VideoMetadata {
  const formats: VideoFormat[] = [];
  if (Array.isArray(info.formats)) {
    for (const fmt of info.formats as Record<string, unknown>[]) {
      if (fmt.vcodec && fmt.vcodec !== "none" && fmt.acodec && fmt.acodec !== "none") {
        const resolution =
          fmt.height && fmt.width ? `${fmt.height}p` : (fmt.format_note as string) || "Unknown";
        formats.push({
          formatId: fmt.format_id as string,
          ext: fmt.ext as string,
          resolution,
          fps: fmt.fps as number | undefined,
          codec: fmt.vcodec as string,
          bitrate: fmt.tbr ? `${Math.round(fmt.tbr as number)}k` : undefined,
        });
      }
    }
  }
  const uniqueFormats = Array.from(new Map(formats.map((f) => [f.formatId, f])).values()).sort(
    (a, b) => (parseInt(b.resolution) || 0) - (parseInt(a.resolution) || 0)
  );
  return {
    id: info.id as string,
    title: (info.title as string) || "Unknown Title",
    duration: (info.duration as number) || 0,
    thumbnail: (info.thumbnail as string) || "",
    formats: uniqueFormats.length > 0 ? uniqueFormats : [{ formatId: "best", ext: "mp4", resolution: "Best Available" }],
    audioFormats: ["mp3", "m4a"],
  };
}

export async function fetchVideoMetadata(url: string): Promise<VideoMetadata> {
  if (!url || typeof url !== "string") throw new Error("Invalid URL provided");

  const safeUrl = url.replace(/"/g, '\\"');
  const extraFlags = isInstagramUrl(url) ? instagramFlags() : "";

  try {
    const { stdout } = await execAsync(
      `yt-dlp -j --no-warnings ${extraFlags}"${safeUrl}"`,
      { maxBuffer: 50 * 1024 * 1024, timeout: 30000 }
    );
    return parseYtDlpInfo(JSON.parse(stdout));
  } catch (primaryError) {
    if (isInstagramUrl(url)) {
      console.warn("Instagram primary fetch failed, retrying with mobile API...");
      try {
        const ua =
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) " +
          "AppleWebKit/605.1.15 (KHTML, like Gecko) " +
          "Version/17.0 Mobile/15E148 Safari/604.1";
        const cookiePath = writeInstagramCookieFile();
        let fallbackFlags =
          `--user-agent "${ua}" ` +
          `--add-header "Accept-Language:en-US,en;q=0.9" ` +
          `--add-header "Referer:https://www.instagram.com/" ` +
          `--no-check-certificate ` +
          `--extractor-args "instagram:api=mobile" `;
        if (cookiePath) fallbackFlags += `--cookies "${cookiePath}" `;
        const { stdout } = await execAsync(
          `yt-dlp -j --no-warnings ${fallbackFlags}"${safeUrl}"`,
          { maxBuffer: 50 * 1024 * 1024, timeout: 30000 }
        );
        return parseYtDlpInfo(JSON.parse(stdout));
      } catch (fallbackError) {
        const msg = fallbackError instanceof Error ? fallbackError.message : "Unknown error";
        if (!process.env.INSTAGRAM_SESSION_ID) {
          throw new Error(
            "Instagram requires authentication to download this video. " +
            "Set the INSTAGRAM_SESSION_ID environment variable to your Instagram session cookie value and restart the server."
          );
        }
        throw new Error(`Failed to fetch Instagram video metadata: ${msg}`);
      }
    }
    throw new Error(
      `Failed to fetch video metadata: ${primaryError instanceof Error ? primaryError.message : "Unknown error"}`
    );
  }
}

export async function downloadVideo(
  url: string,
  options: { quality?: string; audioOnly?: boolean; audioFormat?: string }
): Promise<{ filePath: string; filename: string; fileSize: number }> {
  const tempDir = os.tmpdir();
  const outputTemplate = path.join(tempDir, "yt-dlp-%(title)s.%(ext)s");
  const safeUrl = url.replace(/"/g, '\\"');
  const extraFlags = isInstagramUrl(url) ? instagramFlags() : "";

  try {
    let command = `yt-dlp --no-warnings ${extraFlags}-o "${outputTemplate}"`;
    if (options.audioOnly) {
      const audioFormat = options.audioFormat || "mp3";
      command += ` -x --audio-format ${audioFormat} --audio-quality 192`;
    } else if (options.quality) {
      command += ` -f "${options.quality}+bestaudio/best"`;
    } else {
      command += ` -f "best"`;
    }
    command += ` "${safeUrl}"`;

    await execAsync(command, { maxBuffer: 50 * 1024 * 1024, timeout: 300000 });

    const files = fs.readdirSync(tempDir);
    const downloadedFile = files.find(
      (file) =>
        file.startsWith("yt-dlp-") &&
        fs.statSync(path.join(tempDir, file)).mtime.getTime() > Date.now() - 60000
    );
    if (!downloadedFile) throw new Error("Downloaded file not found");

    const filePath = path.join(tempDir, downloadedFile);
    const fileSize = fs.statSync(filePath).size;
    return { filePath, filename: downloadedFile, fileSize };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    if (isInstagramUrl(url) && !process.env.INSTAGRAM_SESSION_ID) {
      throw new Error(
        "Instagram requires authentication to download this video. " +
        "Set the INSTAGRAM_SESSION_ID environment variable to your Instagram session cookie value and restart the server."
      );
    }
    throw new Error(`Failed to download video: ${msg}`);
  }
}

export function cleanupFile(filePath: string): void {
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (error) {
    console.error("Error cleaning up file:", error);
  }
}
