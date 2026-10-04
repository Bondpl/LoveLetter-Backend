import { Pool } from "pg";
import { getMessaging } from "firebase-admin/messaging";

export class NotificationService {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async notifyPartner(partnerDeviceToken: string) {
    const message = {
      data: {
        type: "NEW_DRAWING",
        title: "New Drawing",
        body: "Your partner sent you a drawing!",
      },
      token: partnerDeviceToken,
    };

    try {
      await getMessaging().send(message);
    } catch (error: any) {
      console.error("Failed to send push notification:", error);

      if (
        error.code === "messaging/invalid-registration-token" ||
        error.code === "messaging/registration-token-not-registered"
      ) {
        console.log(`Removing invalid token from DB: ${partnerDeviceToken}`);
        try {
          await this.pool.query(
            "UPDATE users SET fcm_token = NULL WHERE fcm_token = $1",
            [partnerDeviceToken],
          );
        } catch (dbErr) {
          console.error("Failed to remove invalid token from DB:", dbErr);
        }
      }
    }
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
