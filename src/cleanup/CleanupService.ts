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
      console.log(
        "[Cleanup] Previous cleanup task still in progress. Skipping.",
      );
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
        console.log(
          `[Cleanup] Cleaned up ${pairsResult.rows.length} expired pair codes.`,
        );
      }

      const deletedPairs = await this.pool.query(
        `DELETE FROM pairs 
         WHERE is_active = FALSE 
           AND created_at < NOW() - INTERVAL '1 hour'
           AND (
             user2_id IS NULL 
             OR NOT EXISTS (SELECT 1 FROM drawings WHERE drawings.pair_id = pairs.id)
           )
         RETURNING id`,
      );
      if (deletedPairs.rows.length > 0) {
        console.log(
          `[Cleanup] Deleted ${deletedPairs.rows.length} inactive pairs.`,
        );
      }

      // 2. Cleanup expired drawings: fetch expired records first
      const selectResult = await this.pool.query(
        `SELECT id, image_url FROM drawings 
         WHERE expires_at <= NOW() 
         LIMIT 1000`,
      );

      const expiredDrawings = selectResult.rows;
      if (expiredDrawings.length === 0) {
        return;
      }

      console.log(
        `[Cleanup] Found ${expiredDrawings.length} expired drawings to delete.`,
      );

      // 3. Extract S3 keys
      const itemsToDelete = expiredDrawings.map((row) => {
        const url = row.image_url as string;
        const drawingsIndex = url.lastIndexOf("drawings/");
        const key = drawingsIndex !== -1 ? url.substring(drawingsIndex) : null;
        return { id: row.id as number, key };
      });

      const keysToDelete = itemsToDelete
        .map((item) => item.key)
        .filter((key): key is string => Boolean(key));

      const bucketName = process.env.S3_BUCKET_NAME;

      // 4. Delete from S3 first so we don't orphan files if S3 fails
      if (keysToDelete.length > 0 && bucketName) {
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
          console.log(
            `[Cleanup] Deleted batch of ${chunk.length} objects from S3 storage.`,
          );
        }
        console.log(
          `[Cleanup] Successfully purged ${keysToDelete.length} files from S3.`,
        );
      } else if (!bucketName && keysToDelete.length > 0) {
        console.warn(
          "[Cleanup] S3_BUCKET_NAME is not set. Skipping S3 deletion.",
        );
      }

      // 5. Delete successfully processed records from PostgreSQL
      const idsToDelete = itemsToDelete.map((item) => item.id);
      await this.pool.query(
        `DELETE FROM drawings WHERE id = ANY($1::int[])`,
        [idsToDelete],
      );
      console.log(
        `[Cleanup] Deleted ${idsToDelete.length} drawing records from database.`,
      );
    } catch (error) {
      console.error(
        "[Cleanup] Error during automated cleanup execution:",
        error,
      );
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
