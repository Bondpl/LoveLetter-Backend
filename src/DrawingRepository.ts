import { Pool } from "pg";
import { getMessaging } from "firebase-admin/messaging";

export class DrawingRepository {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async notifyPartner(partnerDeviceToken: string) {
    const message = {
      data: {
        type: "NEW_DRAWING",
      },
      token: partnerDeviceToken,
    };

    await getMessaging().send(message);
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
}
