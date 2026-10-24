import "dotenv/config";
import { S3Client, DeleteObjectsCommand } from "@aws-sdk/client-s3";
import { pool } from "../util/dataBaseConnector";

const s3Client = new S3Client({
  region: process.env.S3_REGION || "us-east-1",
  endpoint: process.env.S3_ENDPOINT,
  forcePathStyle: true,
  credentials: process.env.S3_ACCESS_KEY_ID
    ? {
        accessKeyId: process.env.S3_ACCESS_KEY_ID,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || "",
      }
    : undefined,
});

async function cleanupExpiredDrawings() {
  console.log("Starting cleanup of expired drawings...");

  try {
    const result = await pool.query(
      `DELETE FROM drawings 
       WHERE expires_at <= NOW() 
       RETURNING image_url`,
    );

    const expiredDrawings = result.rows;
    console.log(`Found ${expiredDrawings.length} expired drawings in the database.`);

    if (expiredDrawings.length === 0) {
      console.log("No expired drawings to delete.");
      return;
    }

    const keysToDelete = expiredDrawings
      .map((row) => {
        const url = row.image_url as string;
        const drawingsIndex = url.indexOf("drawings/");
        return drawingsIndex !== -1 ? url.substring(drawingsIndex) : null;
      })
      .filter((key): key is string => Boolean(key));

    // S3 DeleteObjects supports up to 1000 keys per request
    const CHUNK_SIZE = 1000;
    for (let i = 0; i < keysToDelete.length; i += CHUNK_SIZE) {
      const chunk = keysToDelete.slice(i, i + CHUNK_SIZE);

      await s3Client.send(
        new DeleteObjectsCommand({
          Bucket: process.env.S3_BUCKET_NAME,
          Delete: {
            Objects: chunk.map((Key) => ({ Key })),
          },
        }),
      );

      console.log(`Deleted batch of ${chunk.length} objects from storage.`);
    }

    console.log(`Successfully deleted ${keysToDelete.length} files from storage.`);
  } catch (error) {
    console.error("Error during drawing cleanup:", error);
    process.exitCode = 1;
  } finally {
    await pool.end();
    console.log("Database connection closed. Cleanup finished.");
  }
}

cleanupExpiredDrawings();
