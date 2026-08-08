import { DrawingRepository } from "./DrawingRepository";
import { NotificationService } from "./NotificationService";

import {
  GetNewDrawingRequest,
  SaveFcmTokenInput,
  SaveDrawingInput,
} from "./types/requests";
export class DrawingService {
  constructor(
    private drawingRepository: DrawingRepository,
    private notificationService: NotificationService,
  ) {}

  async addNewDrawing(addNewDrawingRequest: SaveDrawingInput) {
    await this.drawingRepository.saveDrawing(
      addNewDrawingRequest.senderId,
      addNewDrawingRequest.drawingBuffer,
    );

    const partnerToken = await this.drawingRepository.getFCMToken(
      addNewDrawingRequest.partnerUserId,
    );

    if (partnerToken) {
      await this.notificationService.notifyPartner(partnerToken);
    }
  }

  async getNewDrawing(getNewDrawingRequest: GetNewDrawingRequest) {
    const drawingBuffer = await this.drawingRepository.getLatestDrawing(
      getNewDrawingRequest.userId,
    );
    return drawingBuffer;
  }

  async saveFcmToken(FcmTokenRequest: SaveFcmTokenInput) {
    if (!FcmTokenRequest.token) {
      throw new Error("FCM token is required");
    }

    await this.drawingRepository.saveFCMToken(
      FcmTokenRequest.userId,
      FcmTokenRequest.token,
    );
  }
}
