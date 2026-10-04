import { Pool } from "pg";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { SignedUrl } from "../types/SignedUrl";

export class DrawingRepository {
  private pool: Pool;
  private s3Client: S3Client;

  constructor(pool: Pool) {
    this.pool = pool;

    this.s3Client = new S3Client({
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
  }

  async sendSignedUrl(senderId: string): Promise<SignedUrl> {
    const pairResult = await this.pool.query(
      `SELECT id FROM pairs WHERE (user1_id = $1 OR user2_id = $1) AND is_active = TRUE LIMIT 1`,
      [senderId],
    );

    if (pairResult.rows.length === 0) {
      throw new Error("Sender is not in an active pair");
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

  async confirmDrawing(senderId: string, fileKey: string): Promise<void> {
    const pairResult = await this.pool.query(
      `SELECT id FROM pairs WHERE (user1_id = $1 OR user2_id = $1) AND is_active = TRUE LIMIT 1`,
      [senderId],
    );
    if (pairResult.rows.length === 0) return;

    const pairId = pairResult.rows[0].id;
    const permanentImageUrl = `${process.env.S3_ENDPOINT}/${process.env.S3_BUCKET_NAME}/${fileKey}`;

    await this.pool.query(
      `WITH cleanup AS (                                                                                  
             DELETE FROM drawings WHERE expires_at <= NOW()                                                   
           )                                                                                                  
           INSERT INTO drawings(pair_id, sender_id, image_url, expires_at)                                    
           VALUES($1, $2, $3, NOW() + INTERVAL '3 days')`,
      [pairId, senderId, permanentImageUrl],
    );
  }

  async getLatestDrawing(myUserId: string): Promise<string | null> {
    const pairResult = await this.pool.query(
      `SELECT id FROM pairs WHERE (user1_id = $1 OR user2_id = $1) AND is_active = TRUE LIMIT 1`,
      [myUserId],
    );

    if (pairResult.rows.length === 0) {
      return null;
    }

    const pairId = pairResult.rows[0].id;

    const result = await this.pool.query(
      `SELECT image_url FROM drawings 
       WHERE pair_id = $1 AND sender_id != $2 AND expires_at > NOW() 
       ORDER BY id DESC LIMIT 1`,
      [pairId, myUserId],
    );

    if (result.rows.length > 0) {
      return result.rows[0].image_url;
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

  async saveFCMToken(userId: string, fcmToken: string): Promise<void> {
    await this.pool.query(`UPDATE users SET fcm_token = $2 WHERE id = $1`, [
      userId,
      fcmToken,
    ]);
  }

  async getFCMToken(userId: string): Promise<string | null> {
    const result = await this.pool.query(
      `SELECT fcm_token FROM users WHERE id = $1`,
      [userId],
    );
    return result.rows.length > 0 ? result.rows[0].fcm_token : null;
  }
}
