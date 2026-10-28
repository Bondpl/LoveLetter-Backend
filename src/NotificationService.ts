import { Pool } from "pg";
import { getMessaging } from "firebase-admin/messaging";

export class NotificationService {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  private async sendDataMessage(
    token: string,
    data: Record<string, string>,
  ): Promise<void> {
    const message = {
      data,
      token,
    };

    try {
      await getMessaging().send(message);
    } catch (error: any) {
      console.error(`Failed to send push notification (${data.type}):`, error);

      if (
        error.code === "messaging/invalid-registration-token" ||
        error.code === "messaging/registration-token-not-registered"
      ) {
        console.log(`Removing invalid token from DB: ${token}`);
        try {
          await this.pool.query(
            "UPDATE users SET fcm_token = NULL WHERE fcm_token = $1",
            [token],
          );
        } catch (dbErr) {
          console.error("Failed to remove invalid token from DB:", dbErr);
        }
      }
    }
  }

  async notifyPartnerIfTokenExists(partnerId: string): Promise<void> {
    const token = await this.getFCMToken(partnerId);
    if (!token) return;

    await this.sendDataMessage(token, {
      type: "NEW_DRAWING",
      title: "New Drawing",
      body: "Your partner sent you a drawing!",
    });
  }

  async notifyPartnerDisconnect(partnerId: string): Promise<void> {
    const token = await this.getFCMToken(partnerId);
    if (!token) return;

    await this.sendDataMessage(token, {
      type: "PAIR_DISCONNECTED",
      title: "Pair Disconnected",
      body: "Your partner has left the pair.",
    });
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
