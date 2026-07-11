import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Download history table to track user downloads
 */
export const downloadHistory = mysqlTable("downloadHistory", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id),
  url: varchar("url", { length: 2048 }).notNull(),
  platform: varchar("platform", { length: 64 }).notNull(),
  title: text("title"),
  filename: varchar("filename", { length: 512 }).notNull(),
  downloadType: mysqlEnum("downloadType", ["video", "audio"]).default("video").notNull(),
  quality: varchar("quality", { length: 64 }),
  audioFormat: varchar("audioFormat", { length: 32 }),
  fileSize: int("fileSize"),
  duration: int("duration"),
  thumbnail: varchar("thumbnail", { length: 2048 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type DownloadHistory = typeof downloadHistory.$inferSelect;
export type InsertDownloadHistory = typeof downloadHistory.$inferInsert;