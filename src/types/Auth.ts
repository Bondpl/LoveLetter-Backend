import "express";

export interface JwtPayload {
  userId: string;
  tokenVersion: string;
}

declare global {
  namespace Express {
    interface Request {
      userId: string;
    }
  }
}
