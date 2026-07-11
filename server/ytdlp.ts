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

/**
 * Build Instagram yt-dlp flags using multiple strategies.
 * Strategy 1: --impersonate chrome (best - mimics real Chrome TLS + HTTP fingerprint)
 * Strategy 2: Mobile iPhone UA + graphql API
 * Strategy 3: Desktop Chrome UA + mobile API
 */
function instagramFlags(strategy: 1 | 2 | 3 = 1): string {
  const cookiePath = writeInstagramCookieFile();

  if (strategy === 1) {
    // --impersonate chrome makes yt-dlp mimic Chrome's exact TLS/HTTP fingerprint
    // This is the most effective against IP-based blocking
    let flags = `--impersonate chrome `;
    flags += `--no-check-certificate `;
    flags += `--extractor-args "instagram:api=graphql" `;
    flags += `--geo-bypass `;
    if (cookiePath) flags += `--cookies "${cookiePath}" `;
    return flags;
  }

  if (strategy === 2) {
    const ua =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) " +
      "AppleWebKit/605.1.15 (KHTML, like Gecko) " +
      "Version/17.0 Mobile/15E148 Safari/604.1";
    let flags =
      `--user-agent "${ua}" ` +
      `--add-header "Accept-Language:en-US,en;q=0.9" ` +
      `--add-header "Referer:https://www.instagram.com/" ` +
      `--no-check-certificate ` +
      `--extractor-args "instagram:api=graphql" ` +
      `--geo-bypass `;
    if (cookiePath) flags += `--cookies "${cookiePath}" `;
    return flags;
  }

  // strategy 3 - desktop chrome + mobile API
  const ua2 =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
  let flags =
    `--user-agent "${ua2}" ` +
    `--add-header "Accept-Language:en-US,en;q=0.9" ` +
    `--add-header "Referer:https://www.instagram.com/" ` +
    `--add-header "Sec-Fetch-Dest:document" ` +
    `--add-header "Sec-Fetch-Mode:navigate" ` +
    `--add-header "Sec-Fetch-Site:none" ` +
    `--no-check-certificate ` +
    `--extractor-args "instagram:api=mobile" ` +
    `--geo-bypass `;
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

async function runYtDlp(url: string, flags: string): Promise<string> {
  const safeUrl = url.replace(/"/g, '\\"');
  const { stdout } = await execAsync(
    `yt-dlp -j --no-warnings ${flags}"${safeUrl}"`,
    { maxBuffer: 50 * 1024 * 1024, timeout: 30000 }
  );
  return stdout;
}

export async function fetchVideoMetadata(url: string): Promise<VideoMetadata> {
  if (!url || typeof url !== "string") throw new Error("Invalid URL provided");

  if (!isInstagramUrl(url)) {
    const stdout = await runYtDlp(url, "");
    return parseYtDlpInfo(JSON.parse(stdout));
  }

  // Instagram: try strategies 1 -> 2 -> 3
  const strategies: Array<1 | 2 | 3> = [1, 2, 3];
  let lastError: Error | null = null;

  for (const strategy of strategies) {
    try {
      const flags = instagramFlags(strategy);
      console.log(`[Instagram] Trying strategy ${strategy}...`);
      const stdout = await runYtDlp(url, flags);
      return parseYtDlpInfo(JSON.parse(stdout));
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.warn(`[Instagram] Strategy ${strategy} failed:`, lastError.message);
    }
  }

  // All strategies failed
  if (!process.env.INSTAGRAM_SESSION_ID) {
    throw new Error(
      "Instagram is blocking this server. To download Instagram videos, set the INSTAGRAM_SESSION_ID environment variable " +
      "with your Instagram sessionid cookie value, then redeploy. " +
      "Get it from: Chrome DevTools > Application > Cookies > instagram.com > sessionid"
    );
  }

  throw new Error(
    `Failed to fetch Instagram video metadata. All strategies exhausted. Last error: ${lastError?.message}`
  );
}

export async function downloadVideo(
  url: string,
  options: { quality?: string; audioOnly?: boolean; audioFormat?: string }
): Promise<{ filePath: string; filename: string; fileSize: number }> {
  const tempDir = os.tmpdir();
  const outputTemplate = path.join(tempDir, "yt-dlp-%(title)s.%(ext)s");
  const safeUrl = url.replace(/"/g, '\\"');
  const extraFlags = isInstagramUrl(url) ? instagramFlags(1) : "";

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
        "Instagram is blocking this server. Set the INSTAGRAM_SESSION_ID environment variable " +
        "with your Instagram sessionid cookie value, then redeploy."
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
