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

export interface PairRow {
  id: string;
  user1_id: string | null;
  user2_id: string | null;
  pair_code: string;
  is_active: boolean;
  created_at: Date;
}

export interface AnonymousAuthResponse {
  token: string;
  pairCode: string;
  userId: string;
}

export interface JoinPairResponse {
  token: string;
  pairId: string;
  userId: string;
}
