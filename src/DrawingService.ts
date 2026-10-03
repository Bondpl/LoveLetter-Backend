import { DrawingRepository } from "./DrawingRepository";
import { NotificationService } from "./NotificationService";
import { SaveFcmTokenInput } from "./types/requests";
import { SignedUrl } from "./types/SignedUrl";

export class DrawingService {
  constructor(
    private drawingRepository: DrawingRepository,
    private notificationService: NotificationService,
  ) {}

  async addNewDrawing(senderId: string): Promise<SignedUrl> {
    const signedUrl = await this.drawingRepository.sendSignedUrl(senderId);
    return signedUrl;
  }

  async confirmUploadDrawingAndNotify(
    senderId: string,
    fileKey: string,
  ): Promise<void> {
    await this.drawingRepository.confirmDrawing(senderId, fileKey);
    const partnerId = await this.drawingRepository.getPartnerId(senderId);

    if (partnerId) {
      const partnerToken = await this.drawingRepository.getFCMToken(partnerId);
      if (partnerToken) {
        try {
          await this.notificationService.notifyPartner(partnerToken);
        } catch (err) {
          console.warn("Could not send FCM notification to partner:", err);
        }
      }
    }
  }

  async getNewDrawing(myUserId: string): Promise<string | null> {
    return await this.drawingRepository.getLatestDrawing(myUserId);
  }

  async saveFcmToken(FcmTokenRequest: SaveFcmTokenInput): Promise<void> {
    if (!FcmTokenRequest.token) {
      throw new Error("FCM token is required");
    }

    await this.drawingRepository.saveFCMToken(
      FcmTokenRequest.userId,
      FcmTokenRequest.token,
    );
  }
}
