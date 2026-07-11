import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs";
import os from "os";
import https from "https";

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

/**
 * Build Instagram cookie file from environment variables or a file.
 */
function writeInstagramCookieFile(): string | null {
  // Check for existing file from the app cookie-paste feature
  const appCookiePath = path.join(os.tmpdir(), "instagram_cookies.txt");
  if (fs.existsSync(appCookiePath)) {
    const stat = fs.statSync(appCookiePath);
    if (Date.now() - stat.mtime.getTime() < 24 * 60 * 60 * 1000) {
      return appCookiePath;
    }
  }

  // Option 1: Full cookies.txt as base64 env var
  const fullCookiesB64 = process.env.INSTAGRAM_COOKIES_B64;
  if (fullCookiesB64) {
    try {
      const decoded = Buffer.from(fullCookiesB64, "base64").toString("utf-8");
      fs.writeFileSync(appCookiePath, decoded, "utf-8");
      return appCookiePath;
    } catch (e) {
      console.warn("[Instagram] Failed to decode INSTAGRAM_COOKIES_B64:", e);
    }
  }

  // Option 2: Individual cookie values
  const sessionId = process.env.INSTAGRAM_SESSION_ID;
  if (!sessionId) return null;

  const dsUserId = process.env.INSTAGRAM_DS_USER_ID || "";
  const csrfToken = process.env.INSTAGRAM_CSRFTOKEN || "";
  const mid = process.env.INSTAGRAM_MID || "";
  const igDid = process.env.INSTAGRAM_IG_DID || "";
  const rur = process.env.INSTAGRAM_RUR || "";

  const lines = [
    "# Netscape HTTP Cookie File",
    "",
    `.instagram.com\tTRUE\t/\tTRUE\t9999999999\tsessionid\t${sessionId}`,
  ];
  if (dsUserId) lines.push(`.instagram.com\tTRUE\t/\tTRUE\t9999999999\tds_user_id\t${dsUserId}`);
  if (csrfToken) lines.push(`.instagram.com\tTRUE\t/\tTRUE\t9999999999\tcsrftoken\t${csrfToken}`);
  if (mid) lines.push(`.instagram.com\tTRUE\t/\tTRUE\t9999999999\tmid\t${mid}`);
  if (igDid) lines.push(`.instagram.com\tTRUE\t/\tTRUE\t9999999999\tig_did\t${igDid}`);
  if (rur) lines.push(`.instagram.com\tTRUE\t/\tTRUE\t9999999999\trur\t${rur}`);

  fs.writeFileSync(appCookiePath, lines.join("\n"), "utf-8");
  return appCookiePath;
}

function instagramFlags(strategy: 1 | 2 | 3 = 1): string {
  const cookiePath = writeInstagramCookieFile();

  if (strategy === 1) {
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

/**
 * Strategy 4: Scrape Instagram's public embed page directly.
 * No cookies needed for public content. Works when yt-dlp is blocked.
 */
async function scrapeInstagramEmbed(url: string): Promise<VideoMetadata> {
  const shortcode = url.match(/(?:reel|p|tv|post)\/([A-Za-z0-9_-]+)/)?.[1];
  if (!shortcode) throw new Error("Could not extract Instagram shortcode from URL");

  const embedUrl = `https://www.instagram.com/p/${shortcode}/embed/`;

  return new Promise((resolve, reject) => {
    const ua =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

    const req = https.get(
      embedUrl,
      {
        headers: {
          "User-Agent": ua,
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          "Referer": "https://www.instagram.com/",
          "Sec-Fetch-Dest": "document",
          "Sec-Fetch-Mode": "navigate",
          "Sec-Fetch-Site": "same-origin",
        },
        timeout: 15000,
      },
      (res) => {
        let body = "";
        res.on("data", (d) => (body += d));
        res.on("end", () => {
          try {
            // Look for og:video or video_url in meta tags
            const videoMatch = body.match(/<meta[^>]+property="og:video"[^>]+content="([^"]+)"/i) ||
                               body.match(/<meta[^>]+content="([^"]+)"[^>]+property="og:video"/i) ||
                               body.match(/"video_url":"([^"]+)"/);

            const thumbMatch = body.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i) ||
                                 body.match(/"thumbnail_src":"([^"]+)"/);

            const titleMatch = body.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i) ||
                                 body.match(/"title":"([^"]+)"/);

            if (videoMatch && videoMatch[1]) {
              const videoUrl = videoMatch[1].replace(/\\u0026/g, "&");
              const thumbnail = thumbMatch && thumbMatch[1] ? thumbMatch[1].replace(/\\u0026/g, "&") : "";
              const title = titleMatch && titleMatch[1] ? titleMatch[1].replace(/\\u0026/g, "&") : "Instagram Video";

              resolve({
                id: shortcode,
                title,
                duration: 0,
                thumbnail,
                formats: [
                  { formatId: "best", ext: "mp4", resolution: "Best Available" },
                  { formatId: "hd", ext: "mp4", resolution: "HD (if available)" },
                ],
                audioFormats: ["mp3"],
              });
            } else {
              reject(new Error("Could not find video URL in Instagram embed page"));
            }
          } catch (e) {
            reject(e instanceof Error ? e : new Error(String(e)));
          }
        });
      }
    );

    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Instagram embed request timed out"));
    });
  });
}

/**
 * Strategy 5: Use Instagram's GraphQL oEmbed endpoint (public, no cookies).
 */
async function fetchInstagramOEmbed(url: string): Promise<VideoMetadata> {
  const shortcode = url.match(/(?:reel|p|tv|post)\/([A-Za-z0-9_-]+)/)?.[1];
  if (!shortcode) throw new Error("Could not extract Instagram shortcode");

  return new Promise((resolve, reject) => {
    const oembedUrl = `https://graph.facebook.com/v18.0/instagram_oembed?url=${encodeURIComponent(url)}&access_token=public`;

    https.get(oembedUrl, { timeout: 15000 }, (res) => {
      let body = "";
      res.on("data", (d) => (body += d));
      res.on("end", () => {
        try {
          const data = JSON.parse(body);
          if (data.error) {
            reject(new Error(data.error.message || "oEmbed error"));
            return;
          }
          resolve({
            id: shortcode,
            title: data.title || data.author_name || "Instagram Video",
            duration: 0,
            thumbnail: data.thumbnail_url || "",
            formats: [{ formatId: "best", ext: "mp4", resolution: "Best Available" }],
            audioFormats: ["mp3"],
          });
        } catch (e) {
          reject(e instanceof Error ? e : new Error(String(e)));
        }
      });
    }).on("error", reject).on("timeout", function() { this.destroy(); reject(new Error("oEmbed timeout")); });
  });
}

export async function fetchVideoMetadata(url: string): Promise<VideoMetadata> {
  if (!url || typeof url !== "string") throw new Error("Invalid URL provided");

  if (!isInstagramUrl(url)) {
    const stdout = await runYtDlp(url, "");
    return parseYtDlpInfo(JSON.parse(stdout));
  }

  // Try yt-dlp strategies first
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

  // Fallback: Try public embed scraping (no cookies)
  console.log("[Instagram] Trying public embed scraping...");
  try {
    const embedData = await scrapeInstagramEmbed(url);
    return embedData;
  } catch (embedErr) {
    console.warn("[Instagram] Embed scraping failed:", embedErr instanceof Error ? embedErr.message : embedErr);
  }

  // Final fallback: oEmbed
  console.log("[Instagram] Trying oEmbed...");
  try {
    const oembedData = await fetchInstagramOEmbed(url);
    return oembedData;
  } catch (oembedErr) {
    console.warn("[Instagram] oEmbed failed:", oembedErr instanceof Error ? oembedErr.message : oembedErr);
  }

  // All strategies exhausted
  const hasCookies = process.env.INSTAGRAM_SESSION_ID || process.env.INSTAGRAM_COOKIES_B64;

  if (!hasCookies) {
    throw new Error(
      "Instagram is blocking this server. Here's how to fix it:\n\n" +
      "1. Open Chrome on your computer\n" +
      "2. Go to instagram.com and log in\n" +
      "3. Press F12 → Application tab → Cookies → instagram.com\n" +
      "4. Copy the 'sessionid' cookie value\n" +
      "5. Open this app's settings (gear icon) and paste it into 'Instagram Session Cookie'\n\n" +
      "Or use the cookie-paste button in the app to paste all your Instagram cookies at once."
    );
  }

  throw new Error(
    `All download methods failed. Instagram may have blocked this server's IP or the content is private/age-restricted.\n\n` +
    `Last error: ${lastError?.message}\n\n` +
    `If the post works in your browser while logged in, the cookies may be expired. ` +
    `Log into Instagram again and update the cookies in app settings.`
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
    if (isInstagramUrl(url)) {
      const hasCookies = process.env.INSTAGRAM_SESSION_ID || process.env.INSTAGRAM_COOKIES_B64;
      if (!hasCookies) {
        throw new Error(
          "Instagram is blocking this server. Use the cookie-paste button in the app to add your Instagram sessionid cookie, then try again."
        );
      }
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
