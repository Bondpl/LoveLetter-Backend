import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { AuthRepository } from "./AuthRepository";
import { AnonymousAuthResponse, JoinPairResponse } from "../types/requests";
import { AppError } from "../util/appError";
import { withTransaction } from "../util/dataBaseConnector";
import { TokenCache, DrawingCache } from "../util/redisClient";
import { NotificationService } from "../NotificationService";

export class AuthService {
  constructor(
    private authRepository: AuthRepository,
    private tokenCache: TokenCache,
    private notificationService: NotificationService,
    private drawingCache?: DrawingCache,
  ) {}

  private generatePairCode(): string {
    const randomDigits = crypto.randomInt(100000, 1000000);
    return randomDigits.toString();
  }

  private async generateJwtToken(userId: string): Promise<string> {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error("JWT_SECRET environment variable is not configured");
    }
    const tokenVersion = await this.getTokenVersion(userId);
    return jwt.sign({ userId, tokenVersion }, secret, { expiresIn: "10y" });
  }

  async createAnonymousUser(publicKey: string): Promise<AnonymousAuthResponse> {
    const maxAttempts = 5;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const pairCode = this.generatePairCode();

      try {
        const userId = await withTransaction(async (tx) => {
          await this.authRepository.cleanupExpiredPairs(tx);

          const id = await this.authRepository.createUser(publicKey, tx);
          await this.authRepository.createPair(id, pairCode, tx);
          return id;
        });

        const token = await this.generateJwtToken(userId);

        return {
          token,
          pairCode,
          userId,
        };
      } catch (error: any) {
        if (error.code === "23505" && attempt < maxAttempts) {
          console.warn(
            `Pair code collision for ${pairCode}. Retrying (${attempt}/${maxAttempts})...`,
          );
          continue;
        }
        throw error;
      }
    }

    throw new AppError(
      "Failed to generate a unique pair code. Please try again.",
      500,
    );
  }

  async joinPairWithCode(
    pairCode: string,
    publicKey: string,
  ): Promise<JoinPairResponse> {
    const pairCodeStr = String(pairCode).trim();
    const pair = await this.authRepository.findPairByCode(pairCodeStr);

    if (!pair) {
      throw new AppError("Invalid or expired pair code", 400);
    }

    if (pair.user2_id) {
      throw new AppError("This pair is already full!", 403);
    }

    const userId = await withTransaction(async (tx) => {
      const newUserId = await this.authRepository.createUser(publicKey, tx);

      const joinedSuccessfully = await this.authRepository.joinPair(
        pair.id,
        newUserId,
        tx,
      );

      if (!joinedSuccessfully) {
        throw new AppError(
          "The pair was filled a millisecond ago by someone else!",
          409,
        );
      }
      return newUserId;
    });

    const token = await this.generateJwtToken(userId);
    const partnerPublicKey = await this.authRepository.getUserPublicKey(
      pair.user1_id!,
    );

    return {
      token,
      pairId: pair.id,
      userId,
      partnerPublicKey,
    };
  }

  async leavePair(userId: string): Promise<void> {
    const { partnerId, pairId } = await this.authRepository.leavePair(userId);

    // Clear FCM tokens so old user rows don't receive stale notifications
    await this.notificationService.clearFCMToken(userId);
    if (partnerId) {
      await this.notificationService.clearFCMToken(partnerId);
    }

    // Invalidate JWT tokens so old credentials can no longer be used
    await this.authRepository.incrementTokenVersion(userId);
    await this.tokenCache.clearTokenVersion(userId);

    if (partnerId) {
      await this.authRepository.incrementTokenVersion(partnerId);
      await this.tokenCache.clearTokenVersion(partnerId);
    }

    if (this.drawingCache) {
      await this.drawingCache.clearDrawing(userId);
      if (partnerId) {
        await this.drawingCache.clearDrawing(partnerId);
      }
    }

    if (partnerId && pairId) {
      await this.notificationService.notifyPartnerDisconnect(partnerId, pairId);
    }
  }

  async getTokenVersion(userId: string): Promise<number> {
    const cachedVersion = await this.tokenCache.getTokenVersion(userId);
    if (cachedVersion !== null) {
      return cachedVersion;
    }
    const tokenVersion = await this.authRepository.getTokenVersion(userId);
    await this.tokenCache.setTokenVersion(userId, tokenVersion);
    return tokenVersion;
  }

  async getPairStatus(userId: string) {
    const pair = await this.authRepository.findPairByUserId(userId);

    if (!pair || !pair.user2_id) {
      return { isPaired: false };
    }
    const partnerId = pair.user1_id === userId ? pair.user2_id : pair.user1_id;
    const partnerPublicKey = await this.authRepository.getUserPublicKey(
      partnerId!,
    );

    return { isPaired: true, partnerPublicKey };
  }
}
