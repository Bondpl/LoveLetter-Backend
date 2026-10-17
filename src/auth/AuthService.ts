import jwt from "jsonwebtoken";
import { AuthRepository } from "./AuthRepository";
import { AnonymousAuthResponse, JoinPairResponse } from "../types/requests";
import { AppError } from "../util/appError";

export class AuthService {
  constructor(private authRepository: AuthRepository) {}

  private generatePairCode(): string {
    const randomDigits = Math.floor(100000 + Math.random() * 900000);
    return `${randomDigits}`;
  }

  private async generateJwtToken(userId: string): Promise<string> {
    const secret = process.env.JWT_SECRET || "local_jwt_secret_key";
    const tokenVersion = await this.getTokenVersion(userId);
    return jwt.sign({ userId, tokenVersion }, secret, { expiresIn: "10y" });
  }

  async createAnonymousUser(publicKey: string): Promise<AnonymousAuthResponse> {
    const userId = await this.authRepository.createUser(publicKey);
    const pairCode = this.generatePairCode();

    await this.authRepository.createPair(userId, pairCode);
    const token = await this.generateJwtToken(userId);

    return {
      token,
      pairCode,
      userId,
    };
  }

  async joinPairWithCode(
    pairCode: string,
    publicKey: string,
  ): Promise<JoinPairResponse> {
    const pairCodeStr = String(pairCode).trim();
    const pair = await this.authRepository.findPairByCode(pairCodeStr);

    if (!pair) {
      throw new AppError("Invalid or inactive pair code", 400);
    }

    if (pair.user2_id) {
      throw new AppError("This pair is already full!", 403);
    }

    const userId = await this.authRepository.createUser(publicKey);
    const joinedSuccessfully = await this.authRepository.joinPair(
      pair.id,
      userId,
    );
    if (!joinedSuccessfully) {
      throw new AppError(
        "The pair was filled a millisecond ago by someone else!",
        409,
      );
    }
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

  async leavePair(userId: string) {
    await this.authRepository.leavePair(userId);
  }

  async getTokenVersion(userId: string): Promise<number> {
    return await this.authRepository.getTokenVersion(userId);
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
