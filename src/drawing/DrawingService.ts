import { DrawingRepository } from "../drawing/DrawingRepository";
import { NotificationService } from "../NotificationService";
import { SaveFcmTokenInput } from "../types/requests";
import { SignedUrl } from "../types/SignedUrl";
import { Drawing } from "../types/Drawing";
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
    iv: string,
  ): Promise<void> {
    await this.drawingRepository.confirmDrawing(senderId, fileKey, iv);

    const partnerId = await this.drawingRepository.getPartnerId(senderId);
    if (!partnerId) return;

    await this.drawingCache.clearDrawing(partnerId);
    await this.notificationService.notifyPartnerIfTokenExists(partnerId);
  }

  async getNewDrawing(userId: string): Promise<Drawing | null> {
    const cached = await this.drawingCache.getLatestDrawing(userId);
    if (cached) return cached;

    const drawing = await this.drawingRepository.getLatestDrawing(userId);
    if (drawing) {
      await this.drawingCache.saveLatestDrawing(userId, drawing);
    }
    return drawing;
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
