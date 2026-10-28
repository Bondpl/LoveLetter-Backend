import "dotenv/config";
import { pool } from "../util/dataBaseConnector";
import { s3Client } from "../util/s3Client";
import { CleanupService } from "../cleanup/CleanupService";

async function main() {
  console.log("Running manual cleanup via CLI...");
  const cleanupService = new CleanupService(pool, s3Client);
  try {
    await cleanupService.runCleanup();
    console.log("Manual cleanup finished successfully.");
  } catch (error) {
    console.error("Manual cleanup failed:", error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
