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
    return jwt.sign({ userId }, secret, { expiresIn: "5d" });
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
    await this.authRepository.joinPair(pair.id, userId);

    const token = this.generateJwtToken(userId);

    return {
      token,
      pairId: pair.id,
      userId,
    };
  }
}
