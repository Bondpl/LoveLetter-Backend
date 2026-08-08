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

    await getMessaging().send(message);
  }
}
