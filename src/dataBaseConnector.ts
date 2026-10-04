import { Pool } from "pg";
import process from "process";
import rateLimit from "express-rate-limit";
import RedisStore from "rate-limit-redis";
import Redis from "ioredis";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL environment variable is not set");
  process.exit(1);
}

const useSsl = process.env.DATABASE_URL?.includes("sslmode=");

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: useSsl ? { rejectUnauthorized: true } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

const redisClient = new Redis(
  process.env.REDIS_URL || "redis://localhost:6379",
);
redisClient.on("error", (err) => console.log("Redis Client Error", err));

export const drawingLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 6,
  message: "Limit rate exceeded.",
  store: new RedisStore({
    sendCommand: (...args: string[]) =>
      redisClient.call(args[0]!, ...args.slice(1)) as any,
  }),
});

pool.on("error", (err) => {
  console.error("Database pool error:", err);
});

pool.on("connect", () => {
  console.log("Database connected");
});
