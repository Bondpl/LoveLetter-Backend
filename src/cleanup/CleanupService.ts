import { Pool } from "pg";
import { S3Client, DeleteObjectsCommand } from "@aws-sdk/client-s3";

const DEFAULT_INTERVAL_MS = 12 * 60 * 60 * 1000; // 12 hours

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
    const startTime = Date.now();
    console.log("[Cleanup] ================= START =================");
    try {
      const maxAttempts = 3;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          await this.cleanupPairs();
          await this.cleanupDrawings();
          await this.cleanupOrphanedUsers();
          break;
        } catch (err: any) {
          const isTransient =
            err?.message?.includes("Connection terminated") ||
            err?.message?.includes("timeout") ||
            ["57P01", "08006", "08003"].includes(err?.code);

          if (isTransient && attempt < maxAttempts) {
            console.warn(
              `[Cleanup] Transient DB connection error (attempt ${attempt}/${maxAttempts}): ${err.message}. Retrying in ${attempt * 2}s...`,
            );
            await new Promise((res) => setTimeout(res, attempt * 2000));
            continue;
          }
          throw err;
        }
      }

      const durationMs = Date.now() - startTime;
      console.log(
        `[Cleanup] ================= END (completed in ${durationMs}ms) =================`,
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

  private async cleanupPairs(): Promise<void> {
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
  }

  private async cleanupDrawings(): Promise<void> {
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

    const idsToDelete = itemsToDelete.map((item) => item.id);
    await this.pool.query(`DELETE FROM drawings WHERE id = ANY($1::int[])`, [
      idsToDelete,
    ]);
    console.log(
      `[Cleanup] Deleted ${idsToDelete.length} drawing records from database.`,
    );
  }

  private async cleanupOrphanedUsers(): Promise<void> {
    const deletedUsersResult = await this.pool.query(
      `DELETE FROM users 
       WHERE created_at < NOW() - INTERVAL '24 hours'
         AND NOT EXISTS (
           SELECT 1 FROM pairs 
           WHERE pairs.user1_id = users.id OR pairs.user2_id = users.id
         )
         AND NOT EXISTS (
           SELECT 1 FROM drawings 
           WHERE drawings.sender_id = users.id
         )
       RETURNING id`,
    );
    if (deletedUsersResult.rows.length > 0) {
      console.log(
        `[Cleanup] Deleted ${deletedUsersResult.rows.length} orphaned user records from database.`,
      );
    }
  }

  startScheduler(intervalMs = DEFAULT_INTERVAL_MS): void {
    if (this.intervalTimer) {
      return;
    }

    console.log(
      `[Cleanup] Starting in-app automated cleanup scheduler (interval: ${intervalMs / 1000 / 60 / 60}h)`,
    );

    // Initial run after 15 seconds to let server start up smoothly and DB wake up
    setTimeout(() => {
      this.runCleanup().catch((err) =>
        console.error("[Cleanup] Error in initial cleanup run:", err),
      );
    }, 15000).unref();

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
