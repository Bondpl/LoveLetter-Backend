import { Pool } from "pg";
import { S3Client, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { SignedUrl } from "../types/SignedUrl";
import { Drawing } from "../types/Drawing";
import { AppError } from "../util/appError";
import { s3Client as defaultS3Client } from "../util/s3Client";

export class DrawingRepository {
  private pool: Pool;
  private s3Client: S3Client;

  constructor(pool: Pool, s3?: S3Client) {
    this.pool = pool;
    this.s3Client = s3 ?? defaultS3Client;
  }

  async sendSignedUrl(senderId: string): Promise<SignedUrl> {
    const pairResult = await this.pool.query(
      `SELECT id FROM pairs WHERE (user1_id = $1 OR user2_id = $1) AND user2_id IS NOT NULL AND is_active = TRUE LIMIT 1`,
      [senderId],
    );

    if (pairResult.rows.length === 0) {
      throw new AppError("Sender is not in an active pair", 403);
    }

    const pairId = pairResult.rows[0].id;
    const s3Key = `drawings/${pairId}/${Date.now()}.png`;

    const presignedUrl = await getSignedUrl(
      this.s3Client,
      new PutObjectCommand({
        Bucket: process.env.S3_BUCKET_NAME,
        Key: s3Key,
        ContentType: "image/png",
      }),
      { expiresIn: 60 },
    );

    return { S3URL: presignedUrl, filekey: s3Key };
  }

  async confirmDrawing(
    senderId: string,
    fileKey: string,
    iv: string,
  ): Promise<void> {
    const pairResult = await this.pool.query(
      `SELECT id FROM pairs WHERE (user1_id = $1 OR user2_id = $1) AND user2_id IS NOT NULL AND is_active = TRUE LIMIT 1`,
      [senderId],
    );

    if (pairResult.rows.length === 0) {
      throw new AppError("Sender is not in an active pair", 403);
    }

    const pairId = pairResult.rows[0].id;

    // Validate that the fileKey belongs to this pair's drawings directory
    if (!fileKey.startsWith(`drawings/${pairId}/`)) {
      throw new AppError("Invalid file key for this pair", 400);
    }

    // Verify that the object actually exists in S3 before inserting into database
    try {
      await this.s3Client.send(
        new HeadObjectCommand({
          Bucket: process.env.S3_BUCKET_NAME,
          Key: fileKey,
        }),
      );
    } catch (err: any) {
      if (err.name === "NotFound" || err.$metadata?.httpStatusCode === 404) {
        throw new AppError("Uploaded file not found in storage", 400);
      }
      throw err;
    }

    // Build public/endpoint URL compatible with both custom S3 endpoints (MinIO) and standard AWS S3
    const permanentImageUrl = process.env.S3_ENDPOINT
      ? `${process.env.S3_ENDPOINT}/${process.env.S3_BUCKET_NAME}/${fileKey}`
      : `https://${process.env.S3_BUCKET_NAME}.s3.${process.env.S3_REGION || "us-east-1"}.amazonaws.com/${fileKey}`;

    await this.pool.query(
      `INSERT INTO drawings(pair_id, sender_id, image_url, expires_at, iv)                                    
       VALUES($1, $2, $3, NOW() + INTERVAL '3 days', $4)`,
      [pairId, senderId, permanentImageUrl, iv],
    );
  }

  async getLatestDrawing(myUserId: string): Promise<Drawing | null> {
    const pairResult = await this.pool.query(
      `SELECT id FROM pairs WHERE (user1_id = $1 OR user2_id = $1) AND is_active = TRUE LIMIT 1`,
      [myUserId],
    );

    if (pairResult.rows.length === 0) {
      return null;
    }

    const pairId = pairResult.rows[0].id;

    const result = await this.pool.query(
      `SELECT image_url, iv FROM drawings 
       WHERE pair_id = $1 AND sender_id != $2 AND expires_at > NOW() 
       ORDER BY id DESC LIMIT 1`,
      [pairId, myUserId],
    );

    if (result.rows.length > 0) {
      const { image_url: imageUrl, iv } = result.rows[0];
      return { imageUrl, iv };
    }
    return null;
  }

  async getPartnerId(userId: string): Promise<string | null> {
    const result = await this.pool.query(
      `SELECT user1_id, user2_id FROM pairs WHERE (user1_id = $1 OR user2_id = $1) AND is_active = TRUE LIMIT 1`,
      [userId],
    );

    if (result.rows.length === 0) {
      return null;
    }

    const pair = result.rows[0];
    return pair.user1_id === userId ? pair.user2_id : pair.user1_id;
  }
}
