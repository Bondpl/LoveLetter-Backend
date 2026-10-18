import rateLimit from "express-rate-limit";
import { Drawing } from "../types/Drawing";
import RedisStore from "rate-limit-redis";
import Redis from "ioredis";

export const redisClient = new Redis(
  process.env.REDIS_URL || "redis://localhost:6379",
);
redisClient.on("connect", () => console.log("Redis connected"));
redisClient.on("error", (err) => console.log("Redis Client Error", err));

export const drawingLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,

  max: 6,
  message: "Limit rate exceeded.",
  keyGenerator: (req: any) => {
    return req.userId;
  },
  store: new RedisStore({
    sendCommand: (...args: string[]) =>
      redisClient.call(args[0]!, ...args.slice(1)) as any,
  }),
});

export class DrawingCache {
  constructor(private redis: Redis) {}

  private getPartnerDrawingKey(userId: string): string {
    return `latest_drawing:${userId}`;
  }

  async getLatestDrawing(userId: string): Promise<Drawing | null> {
    const key = this.getPartnerDrawingKey(userId);
    const raw = await this.redis.get(key);
    if (!raw) return null;
    return JSON.parse(raw) as Drawing;
  }

  async saveLatestDrawing(userId: string, drawing: Drawing): Promise<void> {
    const key = this.getPartnerDrawingKey(userId);
    await this.redis.set(key, JSON.stringify(drawing), "EX", 259200);
  }
  async clearDrawing(userId: string) {
    const key = this.getPartnerDrawingKey(userId);
    await this.redis.del(key);
  }
}

export class TokenCache {
  constructor(private redis: Redis) {}
  private getTokenVersionKey(userId: string): string {
    return `jwtVersion:${userId}`;
  }

  async getTokenVersion(userId: string) {
    const key = this.getTokenVersionKey(userId);
    const version = await this.redis.get(key);
    if (version !== null) {
      return parseInt(version, 10);
    }
    return null;
  }

  async setTokenVersion(userId: string, version: number) {
    const key = this.getTokenVersionKey(userId);
    await this.redis.set(key, JSON.stringify(version), "EX", 259200);
  }

  async clearTokenVersion(userId: string): Promise<void> {
    const key = this.getTokenVersionKey(userId);
    await this.redis.del(key);
  }
}
