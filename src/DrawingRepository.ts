import { Pool } from "pg";

export class DrawingRepository {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async saveDrawing(senderId: string, drawingData: Buffer): Promise<void> {
    await this.pool.query(
      `WITH cleanup AS (
         DELETE FROM drawings WHERE expires_at <= NOW()
       )
       INSERT INTO drawings(sender_id, image_data, expires_at) 
       VALUES($1, $2, NOW() + INTERVAL '3 days')`,
      [senderId, drawingData],
    );
  }

  async getLatestDrawing(myUserId: string): Promise<Buffer | null> {
    const result = await this.pool.query(
      `SELECT image_data FROM drawings 
       WHERE sender_id != $1 AND expires_at > NOW() 
       ORDER BY id DESC LIMIT 1`,
      [myUserId],
    );

    if (result.rows.length > 0) {
      return result.rows[0].image_data;
    }
    return null;
  }

  async saveFCMToken(userId: string, fcmToken: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO fcm_tokens(user_id, fcm_token, updated_at) 
       VALUES($1, $2, NOW())
       ON CONFLICT(user_id) DO UPDATE SET fcm_token = $2, updated_at = NOW()`,
      [userId, fcmToken],
    );
  }

  async getFCMToken(userId: string): Promise<string | null> {
    const result = await this.pool.query(
      `SELECT fcm_token FROM fcm_tokens WHERE user_id = $1`,
      [userId],
    );
    return result.rows.length > 0 ? result.rows[0].fcm_token : null;
  }
}
