import { DrawingRepository } from "../drawing/DrawingRepository";
import { NotificationService } from "../NotificationService";
import { SaveFcmTokenInput } from "../types/requests";
import { SignedUrl } from "../types/SignedUrl";
import { AppError } from "../util/appError";
import { DrawingCache } from "../util/redisClient";
export class DrawingService {
  constructor(
    private drawingRepository: DrawingRepository,
    private notificationService: NotificationService,
    private drawingCache: DrawingCache,
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
      const partnerToken =
        await this.notificationService.getFCMToken(partnerId);
      if (partnerToken) {
        try {
          await this.notificationService.notifyPartner(partnerToken);
        } catch (err) {
          console.warn("Could not send FCM notification to partner:", err);
        }
      }
    }
  }

  async getNewDrawing(userId: string): Promise<string | null> {
    const cachedUrl = await this.drawingCache.getLatestDrawing(userId);
    if (cachedUrl) {
      return cachedUrl;
    }

    const dbUrl = await this.drawingRepository.getLatestDrawing(userId);

    if (dbUrl) {
      await this.drawingCache.saveLatestDrawing(userId, dbUrl);
    }
    return dbUrl;
  }

  async saveFcmToken(FcmTokenRequest: SaveFcmTokenInput): Promise<void> {
    if (!FcmTokenRequest.token) {
      throw new AppError("FCM token is required", 400);
    }

    await this.notificationService.saveFCMToken(
      FcmTokenRequest.userId,
      FcmTokenRequest.token,
    );
  }
}
