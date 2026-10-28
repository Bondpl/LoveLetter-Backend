import { Pool } from "pg";
import { S3Client, DeleteObjectsCommand } from "@aws-sdk/client-s3";

export class CleanupService {
  private intervalTimer: NodeJS.Timeout | null = null;
  private isCleaning = false;

  constructor(
    private pool: Pool,
    private s3Client: S3Client,
  ) {}

  async runCleanup(): Promise<void> {
    if (this.isCleaning) {
      console.log("[Cleanup] Previous cleanup task still in progress. Skipping.");
      return;
    }

    this.isCleaning = true;
    try {
      // 1. Cleanup expired pair codes (> 10 minutes)
      const pairsResult = await this.pool.query(
        `UPDATE pairs 
         SET pair_code = NULL, is_active = FALSE 
         WHERE user2_id IS NULL 
           AND pair_code IS NOT NULL 
           AND created_at < NOW() - INTERVAL '10 minutes'
         RETURNING id`,
      );
      if (pairsResult.rows.length > 0) {
        console.log(`[Cleanup] Cleaned up ${pairsResult.rows.length} expired pair codes.`);
      }

      // 2. Cleanup expired drawings from PostgreSQL and return URLs
      const result = await this.pool.query(
        `DELETE FROM drawings 
         WHERE expires_at <= NOW() 
         RETURNING image_url`,
      );

      const expiredDrawings = result.rows;
      if (expiredDrawings.length === 0) {
        return;
      }

      console.log(`[Cleanup] Found ${expiredDrawings.length} expired drawings to delete.`);

      // 3. Extract S3 keys
      const keysToDelete = expiredDrawings
        .map((row) => {
          const url = row.image_url as string;
          const drawingsIndex = url.indexOf("drawings/");
          return drawingsIndex !== -1 ? url.substring(drawingsIndex) : null;
        })
        .filter((key): key is string => Boolean(key));

      if (keysToDelete.length === 0) {
        return;
      }

      const bucketName = process.env.S3_BUCKET_NAME;
      if (!bucketName) {
        console.warn("[Cleanup] S3_BUCKET_NAME is not set. Skipping S3 deletion.");
        return;
      }

      // 4. Batch delete from S3 (max 1000 per request according to S3 specs)
      const CHUNK_SIZE = 1000;
      for (let i = 0; i < keysToDelete.length; i += CHUNK_SIZE) {
        const chunk = keysToDelete.slice(i, i + CHUNK_SIZE);
        await this.s3Client.send(
          new DeleteObjectsCommand({
            Bucket: bucketName,
            Delete: {
              Objects: chunk.map((Key) => ({ Key })),
            },
          }),
        );
        console.log(`[Cleanup] Deleted batch of ${chunk.length} objects from S3 storage.`);
      }

      console.log(`[Cleanup] Successfully purged ${keysToDelete.length} files from S3.`);
    } catch (error) {
      console.error("[Cleanup] Error during automated cleanup execution:", error);
    } finally {
      this.isCleaning = false;
    }
  }

  startScheduler(intervalMs = 30 * 60 * 1000): void {
    if (this.intervalTimer) {
      return;
    }

    console.log(
      `[Cleanup] Starting in-app automated cleanup scheduler (interval: ${intervalMs / 1000 / 60}m)`,
    );

    // Initial run after 5 seconds to let server start up smoothly
    setTimeout(() => {
      this.runCleanup().catch((err) =>
        console.error("[Cleanup] Error in initial cleanup run:", err),
      );
    }, 5000).unref();

    this.intervalTimer = setInterval(() => {
      this.runCleanup().catch((err) =>
        console.error("[Cleanup] Error in periodic cleanup run:", err),
      );
    }, intervalMs);
    this.intervalTimer.unref();
  }

  stopScheduler(): void {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
      console.log("[Cleanup] In-app automated cleanup scheduler stopped.");
    }
  }
}
