import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router, protectedProcedure } from "./_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { fetchVideoMetadata, detectPlatform, downloadVideo, cleanupFile } from "./ytdlp";
import { addDownloadHistory, getUserDownloadHistory } from "./db";
import { registerDownload } from "./downloadHandler";
import fs from "fs";
import os from "os";
import path from "path";

export const appRouter = router({
  system: systemRouter,
  cookies: router({
    /**
     * Save Instagram cookies sent from the client browser.
     * Expects raw Netscape cookies.txt content.
     */
    setInstagram: publicProcedure
      .input(z.object({ content: z.string().min(10) }))
      .mutation(async ({ input }) => {
        const cookiePath = path.join(os.tmpdir(), "instagram_cookies.txt");
        fs.writeFileSync(cookiePath, input.content, "utf-8");
        return { saved: true, path: cookiePath };
      }),
  }),
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  downloader: router({
    /**
     * Fetch video metadata and available formats
     */
    fetchMetadata: publicProcedure
      .input(z.object({ url: z.string().url() }))
      .query(async ({ input }) => {
        try {
          const platform = detectPlatform(input.url);
          const metadata = await fetchVideoMetadata(input.url);
          return { ...metadata, platform };
        } catch (error) {
          console.error("Metadata fetch error:", error);
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: error instanceof Error ? error.message : "Failed to fetch metadata",
          });
        }
      }),

    /**
     * Download video or audio file — PUBLIC (no auth required for external hosting)
     */
    download: publicProcedure
      .input(
        z.object({
          url: z.string().url(),
          quality: z.string().optional(),
          audioOnly: z.boolean().default(false),
          audioFormat: z.enum(["mp3", "m4a"]).optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        let filePath: string | null = null;

        try {
          const metadata = await fetchVideoMetadata(input.url);
          const platform = detectPlatform(input.url);

          const downloadResult = await downloadVideo(input.url, {
            quality: input.quality,
            audioOnly: input.audioOnly,
            audioFormat: input.audioFormat,
          });

          filePath = downloadResult.filePath;

          // Record history if user is authenticated, otherwise skip silently
          if (ctx.user?.id) {
            try {
              await addDownloadHistory({
                userId: ctx.user.id,
                url: input.url,
                platform,
                title: metadata.title,
                filename: downloadResult.filename,
                downloadType: input.audioOnly ? "audio" : "video",
                quality: input.quality,
                audioFormat: input.audioFormat,
                fileSize: downloadResult.fileSize,
                duration: metadata.duration,
                thumbnail: metadata.thumbnail,
              });
            } catch (historyErr) {
              console.warn("History save skipped:", historyErr);
            }
          }

          const downloadToken = registerDownload(downloadResult.filePath);

          return {
            downloadToken,
            filename: downloadResult.filename,
            fileSize: downloadResult.fileSize,
            title: metadata.title,
          };
        } catch (error) {
          if (filePath) {
            cleanupFile(filePath);
          }

          console.error("Download error:", error);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: error instanceof Error ? error.message : "Download failed",
          });
        }
      }),

    /**
     * Get user's download history
     */
    getHistory: protectedProcedure
      .input(z.object({ limit: z.number().default(50) }))
      .query(async ({ input, ctx }) => {
        try {
          return await getUserDownloadHistory(ctx.user.id, input.limit);
        } catch (error) {
          console.error("History fetch error:", error);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to fetch download history",
          });
        }
      }),
  }),
});

export type AppRouter = typeof appRouter;
