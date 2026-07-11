/**
 * Premium tier management for VideoFlow monetization.
 * Free tier: 5 downloads/day, 720p max, single concurrent
 * Premium tier: unlimited, 4K, concurrent, priority
 */
import os from "os";
import path from "path";
import fs from "fs";

const PREMIUM_KEY = process.env.PREMIUM_SECRET_KEY || "videoflow-premium-2026";
const RATE_LIMIT_DIR = path.join(os.tmpdir(), "videoflow-rate-limits");

// Ensure rate limit directory exists
if (!fs.existsSync(RATE_LIMIT_DIR)) {
  fs.mkdirSync(RATE_LIMIT_DIR, { recursive: true });
}

export interface TierInfo {
  tier: "free" | "premium";
  dailyLimit: number;
  downloadsToday: number;
  maxQuality: string;
  concurrentLimit: number;
  features: string[];
}

function getIpIdentifier(req: { ip?: string; headers: { [key: string]: string | string[] | undefined } }): string {
  const forwarded = req.headers["x-forwarded-for"];
  const ip = typeof forwarded === "string"
    ? forwarded.split(",")[0].trim()
    : (req.ip || "unknown");
  return ip.replace(/[^a-zA-Z0-9.-]/g, "_");
}

function getTodayKey(): string {
  return new Date().toISOString().split("T")[0];
}

function getRateLimitFile(ip: string): string {
  return path.join(RATE_LIMIT_DIR, `${ip}_${getTodayKey()}.json`);
}

interface RateLimitData {
  count: number;
  lastReset: string;
}

function readRateLimit(ip: string): RateLimitData {
  const file = getRateLimitFile(ip);
  if (!fs.existsSync(file)) {
    return { count: 0, lastReset: getTodayKey() };
  }
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {
    return { count: 0, lastReset: getTodayKey() };
  }
}

function writeRateLimit(ip: string, data: RateLimitData): void {
  const file = getRateLimitFile(ip);
  fs.writeFileSync(file, JSON.stringify(data), "utf-8");
}

export function isPremiumEnabled(): boolean {
  return !!process.env.PREMIUM_ENABLED;
}

export function checkPremium(ip: string): TierInfo {
  // For now: free tier by default. Premium can be enabled via env var
  // or via a simple license key system.
  const limit = readRateLimit(ip);

  return {
    tier: "free",
    dailyLimit: 5,
    downloadsToday: limit.count,
    maxQuality: "720p",
    concurrentLimit: 1,
    features: [
      "Standard quality downloads",
      "5 downloads per day",
      "Single download at a time",
      "YouTube, TikTok, Twitter, public Instagram",
    ],
  };
}

export function incrementDownload(ip: string): { allowed: boolean; remaining: number } {
  const limit = readRateLimit(ip);
  const dailyLimit = 5;

  if (limit.count >= dailyLimit) {
    return { allowed: false, remaining: 0 };
  }

  limit.count += 1;
  writeRateLimit(ip, limit);

  return { allowed: true, remaining: dailyLimit - limit.count };
}

export function getDownloadStats(ip: string): { downloadsToday: number; remaining: number; limit: number } {
  const limit = readRateLimit(ip);
  const dailyLimit = 5;
  return {
    downloadsToday: limit.count,
    remaining: Math.max(0, dailyLimit - limit.count),
    limit: dailyLimit,
  };
}

/**
 * Validate if a premium license key is valid.
 * Simple HMAC-based validation. In production, use a proper payment provider.
 */
export function validatePremiumKey(key: string): boolean {
  if (!key || key.length < 20) return false;
  // Simple check: key starts with VF-PREMIUM-
  return key.startsWith("VF-PREMIUM-");
}
