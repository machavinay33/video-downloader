import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs";
import os from "os";

const execAsync = promisify(exec);

/**
 * Platform detection based on URL
 */
export function detectPlatform(url: string): string {
  const urlLower = url.toLowerCase();

  if (urlLower.includes("instagram.com") || urlLower.includes("instagr.am")) {
    return "Instagram";
  }
  if (urlLower.includes("youtube.com") || urlLower.includes("youtu.be")) {
    return "YouTube";
  }
  if (urlLower.includes("tiktok.com")) {
    return "TikTok";
  }
  if (urlLower.includes("twitter.com") || urlLower.includes("x.com")) {
    return "Twitter/X";
  }
  if (urlLower.includes("facebook.com") || urlLower.includes("fb.watch")) {
    return "Facebook";
  }
  if (urlLower.includes("reddit.com")) {
    return "Reddit";
  }
  if (urlLower.includes("vimeo.com")) {
    return "Vimeo";
  }
  if (urlLower.includes("dailymotion.com")) {
    return "Dailymotion";
  }

  return "Unknown";
}

/**
 * Video format information
 */
export interface VideoFormat {
  formatId: string;
  ext: string;
  resolution: string;
  fps?: number;
  codec?: string;
  bitrate?: string;
}

/**
 * Video metadata
 */
export interface VideoMetadata {
  id: string;
  title: string;
  duration: number;
  thumbnail: string;
  formats: VideoFormat[];
  audioFormats: string[];
}

/**
 * Fetch video metadata and available formats using yt-dlp
 */
export async function fetchVideoMetadata(url: string): Promise<VideoMetadata> {
  try {
    // Validate URL
    if (!url || typeof url !== "string") {
      throw new Error("Invalid URL provided");
    }

    const isInstagram = url.toLowerCase().includes("instagram.com") || url.toLowerCase().includes("instagr.am");

    // Build yt-dlp command
    let command = `yt-dlp -j --no-warnings`;
    
    if (isInstagram) {
      // Try multiple approaches for Instagram
      command += ` --extractor-args instagram:web_api=true`;
    }
    
    command += ` "${url.replace(/"/g, '\\"')}"`;

    // Run yt-dlp to get JSON info
    let stdout: string;
    try {
      const result = await execAsync(
        command,
        { maxBuffer: 50 * 1024 * 1024, timeout: 30000 }
      );
      stdout = result.stdout;
    } catch (error: any) {
      // If Instagram fails, provide helpful guidance
      if (isInstagram) {
        console.error("Instagram extraction failed:", error.message);
        throw new Error(
          "Instagram content requires authentication to access. This typically happens when:\n" +
          "1. The post is private or restricted\n" +
          "2. Instagram is blocking automated access\n" +
          "3. The post has been deleted\n\n" +
          "Try using a YouTube, TikTok, or other supported platform link instead."
        );
      }
      throw error;
    }

    const info = JSON.parse(stdout);

    // Extract formats
    const formats: VideoFormat[] = [];
    const audioFormats = new Set<string>();

    if (info.formats && Array.isArray(info.formats)) {
      for (const fmt of info.formats) {
        // Video formats
        if (fmt.vcodec && fmt.vcodec !== "none" && fmt.acodec && fmt.acodec !== "none") {
          const resolution =
            fmt.height && fmt.width
              ? `${fmt.height}p`
              : fmt.format_note || "Unknown";

          formats.push({
            formatId: fmt.format_id,
            ext: fmt.ext,
            resolution,
            fps: fmt.fps,
            codec: fmt.vcodec,
            bitrate: fmt.tbr ? `${Math.round(fmt.tbr)}k` : undefined,
          });
        }
      }
    }

    // Always include MP3 and M4A as audio format options
    audioFormats.add("mp3");
    audioFormats.add("m4a");

    // Deduplicate and sort video formats by resolution
    const uniqueFormats = Array.from(
      new Map(formats.map((f) => [f.formatId, f])).values()
    ).sort((a, b) => {
      const aRes = parseInt(a.resolution) || 0;
      const bRes = parseInt(b.resolution) || 0;
      return bRes - aRes;
    });

    return {
      id: info.id,
      title: info.title || "Unknown Title",
      duration: info.duration || 0,
      thumbnail: info.thumbnail || "",
      formats: uniqueFormats.length > 0 ? uniqueFormats : [{formatId: "best", ext: "mp4", resolution: "Best Available"}],
      audioFormats: Array.from(audioFormats),
    };
  } catch (error) {
    console.error("Error fetching video metadata:", error);
    throw new Error(
      `Failed to fetch video metadata: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Download video or audio and return file path
 */
export async function downloadVideo(
  url: string,
  options: {
    quality?: string;
    audioOnly?: boolean;
    audioFormat?: string;
  }
): Promise<{ filePath: string; filename: string; fileSize: number }> {
  const tempDir = os.tmpdir();
  const outputTemplate = path.join(tempDir, "yt-dlp-%(title)s.%(ext)s");

  try {
    let command = `yt-dlp --no-warnings -o "${outputTemplate}"`;

    if (options.audioOnly) {
      const audioFormat = options.audioFormat || "mp3";
      command += ` -x --audio-format ${audioFormat} --audio-quality 192`;
    } else if (options.quality) {
      // Format selection: prioritize quality
      command += ` -f "${options.quality}+bestaudio/best"`;
    } else {
      command += ` -f "best"`;
    }

    command += ` "${url.replace(/"/g, '\\"')}"`;

    await execAsync(command, {
      maxBuffer: 50 * 1024 * 1024,
      timeout: 300000, // 5 minutes for download
    });

    // Find the downloaded file
    const files = fs.readdirSync(tempDir);
    const downloadedFile = files.find(
      (file) =>
        file.startsWith("yt-dlp-") &&
        fs.statSync(path.join(tempDir, file)).mtime.getTime() > Date.now() - 60000 // Modified in last minute
    );

    if (!downloadedFile) {
      throw new Error("Downloaded file not found");
    }

    const filePath = path.join(tempDir, downloadedFile);
    const fileSize = fs.statSync(filePath).size;

    return {
      filePath,
      filename: downloadedFile,
      fileSize,
    };
  } catch (error) {
    console.error("Error downloading video:", error);
    throw new Error(
      `Failed to download video: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Clean up temporary file
 */
export function cleanupFile(filePath: string): void {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    console.error("Error cleaning up file:", error);
  }
}
