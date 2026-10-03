import jwt from "jsonwebtoken";
import { AuthRepository } from "./AuthRepository";
import { AnonymousAuthResponse, JoinPairResponse } from "./types/requests";

export class AuthService {
  constructor(private authRepository: AuthRepository) {}

  private generatePairCode(): string {
    const randomDigits = Math.floor(100000 + Math.random() * 900000);
    return `${randomDigits}`;
  }

  private generateJwtToken(userId: string): string {
    const secret = process.env.JWT_SECRET || "local_jwt_secret_key";
    return jwt.sign({ userId }, secret, { expiresIn: "10y" });
  }

  async createAnonymousUser(): Promise<AnonymousAuthResponse> {
    const userId = await this.authRepository.createUser();
    const pairCode = this.generatePairCode();

    await this.authRepository.createPair(userId, pairCode);
    const token = this.generateJwtToken(userId);

    return {
      token,
      pairCode,
      userId,
    };
  }

  async joinPairWithCode(pairCode: string): Promise<JoinPairResponse> {
    const pairCodeStr = String(pairCode).trim();
    const pair = await this.authRepository.findPairByCode(pairCodeStr);

    if (!pair) {
      throw new Error("Invalid or inactive pair code");
    }

    if (pair.user2_id) {
      throw new Error("This pair is already full!");
    }

    const userId = await this.authRepository.createUser();
    const joinedSuccessfully = await this.authRepository.joinPair(
      pair.id,
      userId,
    );
    if (!joinedSuccessfully) {
      throw new Error("The pair was filled a millisecond ago by someone else!");
    }
    const token = this.generateJwtToken(userId);

    return {
      token,
      pairId: pair.id,
      userId,
    };
  }
  async leaveAndCreateNewPair(userId: string): Promise<{ pairCode: string }> {
    await this.authRepository.leavePair(userId);

    const newPairCode = this.generatePairCode();

    await this.authRepository.createPair(userId, newPairCode);

    return { pairCode: newPairCode };
  }
}
