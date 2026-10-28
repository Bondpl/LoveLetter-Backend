import "dotenv/config";
import express, { type Request, type Response, type NextFunction } from "express";
import { initializeApp, cert } from "firebase-admin/app";
import { DrawingRepository } from "./drawing/DrawingRepository";
import { pool } from "./util/dataBaseConnector";
import { s3Client } from "./util/s3Client";
import {
  drawingLimiter,
  DrawingCache,
  redisClient,
  TokenCache,
  authLimiter,
} from "./util/redisClient";
import { readyMiddleware } from "./middleware/auth";
import { FcmTokenBody } from "./types/FcmTokenRequest";
import "./types/Auth";
import { NotificationService } from "./NotificationService";
import { DrawingService } from "./drawing/DrawingService";
import { AuthRepository } from "./auth/AuthRepository";
import { AuthService } from "./auth/AuthService";
import { CleanupService } from "./cleanup/CleanupService";

if (!process.env.JWT_SECRET) {
  console.error("FATAL: JWT_SECRET environment variable is not configured.");
  process.exit(1);
}

if (process.env.FIREBASE_CREDENTIALS) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS);
    initializeApp({
      credential: cert(serviceAccount),
    });
    console.log("Firebase initialized successfully.");
  } catch (error) {
    console.error("Failed to parse or initialize FIREBASE_CREDENTIALS:", error);
  }
} else {
  console.warn(
    "FIREBASE_CREDENTIALS is not set. Running without Firebase notifications.",
  );
}

const app = express();
app.set("trust proxy", 1);
app.use(express.json());

app.get("/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    await redisClient.ping();
    res.status(200).json({ status: "healthy", timestamp: new Date().toISOString() });
  } catch (err: any) {
    res.status(503).json({ status: "unhealthy", error: err.message });
  }
});

const drawingCache = new DrawingCache(redisClient);
const tokenCache = new TokenCache(redisClient);
const port = process.env.PORT ? parseInt(process.env.PORT) : 8080;

const drawingRepository = new DrawingRepository(pool, s3Client);
const notificationService = new NotificationService(pool);

const drawingService = new DrawingService(
  drawingRepository,
  notificationService,
  drawingCache,
);

const authRepository = new AuthRepository(pool);
const authService = new AuthService(
  authRepository,
  tokenCache,
  notificationService,
  drawingCache,
);
const requireAuth = readyMiddleware(authService);

// Automated in-app cleanup for expired drawings (PostgreSQL + S3) and stale pair codes
const cleanupService = new CleanupService(pool, s3Client);
cleanupService.startScheduler();

app.post("/api/auth/anonymous", authLimiter, async (req, res) => {
  const { publicKey } = req.body;
  if (!publicKey) {
    return res.status(400).json({ error: "publicKey is required", status: 400 });
  }
  const result = await authService.createAnonymousUser(publicKey);
  res.status(200).json(result);
});

app.post("/api/pairs/join", authLimiter, async (req, res) => {
  const { pairCode, publicKey } = req.body;
  if (!publicKey) {
    return res.status(400).json({ error: "publicKey is required", status: 400 });
  }
  if (!pairCode) {
    return res.status(400).json({ error: "pairCode is required", status: 400 });
  }

  const result = await authService.joinPairWithCode(pairCode, publicKey);
  res.status(200).json(result);
});

app.get("/api/pairs/status", requireAuth, async (req, res) => {
  const userId = req.userId!;
  const result = await authService.getPairStatus(userId);
  res.status(200).json(result);
});

app.post("/api/pairs/leave", requireAuth, async (req, res) => {
  const userId = req.userId!;
  await authService.leavePair(userId);
  res.status(200).json({ message: "Left pair successfully" });
});

app.post("/api/drawings", requireAuth, drawingLimiter, async (req, res) => {
  const senderId = req.userId!;
  const urlData = await drawingService.addNewDrawing(senderId);
  res.status(200).json(urlData);
});

app.post("/api/drawings/confirm", requireAuth, async (req, res) => {
  const senderId = req.userId!;
  const { filekey, iv } = req.body ?? {};

  if (!filekey) {
    return res.status(400).json({ error: "filekey is required", status: 400 });
  }
  if (!iv) {
    return res.status(400).json({ error: "iv is required", status: 400 });
  }

  await drawingService.confirmUploadDrawingAndNotify(senderId, filekey, iv);
  res.status(200).json({ message: "Upload confirmed." });
});

app.get("/api/drawings", requireAuth, async (req, res) => {
  const myUserId = req.userId!;
  const drawingUrl = await drawingService.getNewDrawing(myUserId);

  if (drawingUrl) {
    return res.status(200).json({ drawingUrl });
  }
  res.status(404).json({ error: "No new drawings found", status: 404 });
});

app.post("/api/fcm-token", requireAuth, async (req, res) => {
  const userId = req.userId!;
  const { fcmToken } = req.body as FcmTokenBody;

  await drawingService.saveFcmToken({ userId, token: fcmToken });
  res.status(200).json({ message: "FCM token saved successfully" });
});

app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  if (res.headersSent) {
    return next(err);
  }

  const status =
    typeof err.status === "number" && err.status >= 400 && err.status < 600
      ? err.status
      : 500;

  if (status >= 500) {
    console.error(`[${new Date().toISOString()}] Internal Server Error:`, err);
    const message =
      process.env.NODE_ENV === "production"
        ? "Internal server error"
        : err.message || "Internal server error";
    return res.status(status).json({
      error: message,
      status,
    });
  }

  return res.status(status).json({
    error: err.message || "An unexpected error occurred",
    status,
  });
});

const server = app.listen(port, "0.0.0.0", () => {
  console.log(`Server running on http://localhost:${port}`);
});

let isShuttingDown = false;

const gracefulShutdown = async (signal: string) => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`\nReceived ${signal}. Gracefully shutting down...`);

  // Stop automated cleanup scheduler
  cleanupService.stopScheduler();

  const forceExitTimeout = setTimeout(() => {
    console.error("Graceful shutdown timed out. Forcing exit...");
    process.exit(1);
  }, 10000);
  forceExitTimeout.unref();

  server.close(async (err) => {
    if (err) {
      console.error("Error while closing HTTP server:", err);
    } else {
      console.log("HTTP server closed to new requests.");
    }

    try {
      await pool.end();
      console.log("PostgreSQL connection pool closed.");
    } catch (poolErr) {
      console.error("Error closing database pool:", poolErr);
    }

    try {
      await redisClient.quit();
      console.log("Redis client connection closed.");
    } catch (redisErr) {
      console.error("Error closing Redis connection:", redisErr);
    }

    console.log("Graceful shutdown completed.");
    process.exit(0);
  });
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
