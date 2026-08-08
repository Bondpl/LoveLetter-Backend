export interface GetNewDrawingRequest {
  userId: string;
}

export interface SaveDrawingInput {
  senderId: string;
  drawingBuffer: Buffer;
  partnerUserId: string;
}

export interface SaveFcmTokenInput {
  userId: string;
  token: string;
}
