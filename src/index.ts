import "dotenv/config";
import express from "express";
import { initializeApp, cert } from "firebase-admin/app";
import { DrawingRepository } from "./DrawingRepository";
import { pool } from "./dataBaseConnector";
import { requireAuth } from "./middleware/auth";
import type { FcmTokenBody } from "./types/FcmTokenRequest";
import "./types/Auth";
import { NotificationService } from "./NotificationService";
import { DrawingService } from "./DrawingService";
import { AuthRepository } from "./AuthRepository";
import { AuthService } from "./AuthService";

if (process.env.FIREBASE_CREDENTIALS) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS);
    initializeApp({
      credential: cert(serviceAccount),
    });
    console.log("✅ Firebase initialized successfully.");
  } catch (error) {
    console.error("Failed to parse or initialize FIREBASE_CREDENTIALS:", error);
  }
} else {
  console.warn(
    "FIREBASE_CREDENTIALS is not set. Running without Firebase notifications.",
  );
}

const app = express();
const port = process.env.PORT ? parseInt(process.env.PORT) : 8080;

app.use(express.json());
app.use(express.raw({ type: "image/png", limit: "5mb" }));

const drawingRepository = new DrawingRepository(pool);
const notificationService = new NotificationService(pool);

const drawingService = new DrawingService(
  drawingRepository,
  notificationService,
);

const authRepository = new AuthRepository(pool);
const authService = new AuthService(authRepository);

app.post("/api/auth/anonymous", async (req, res) => {
  try {
    const result = await authService.createAnonymousUser();
    res.status(200).json(result);
  } catch (error) {
    console.error("Error creating anonymous user:", error);
    res.status(500).send("Internal Server Error");
  }
});

app.post("/api/pairs/join", async (req, res) => {
  try {
    const { pairCode } = req.body ?? {};
    if (!pairCode) {
      return res.status(400).send("pairCode is required");
    }

    const result = await authService.joinPairWithCode(pairCode);
    res.status(200).json(result);
  } catch (error: any) {
    console.error("Error joining pair:", error);
    res.status(400).send(error.message || "Failed to join pair");
  }
});

app.post("/api/drawings", requireAuth, async (req, res) => {
  try {
    const senderId = req.userId!;
    const drawingBuffer = req.body;

    if (!drawingBuffer || drawingBuffer.length === 0) {
      return res.status(400).send("Drawing image buffer is required");
    }

    await drawingService.addNewDrawing(senderId, drawingBuffer);
    res.status(200).send("Drawing saved successfully to S3 and database");
  } catch (error: any) {
    console.error("Error saving drawing:", error);
    res.status(500).send(error.message || "Internal Server Error");
  }
});

app.get("/api/drawings", requireAuth, async (req, res) => {
  try {
    const myUserId = req.userId!;

    const drawingUrl = await drawingService.getNewDrawing(myUserId);
    if (drawingUrl) {
      return res.status(200).json({ drawingUrl });
    }
    res.status(404).send("No new drawings found");
  } catch (error) {
    console.error("Error fetching drawing:", error);
    res.status(500).send("Internal Server Error");
  }
});

app.post("/api/fcm-token", requireAuth, async (req, res) => {
  try {
    const userId = req.userId!;
    const { token } = (req.body ?? {}) as FcmTokenBody;

    await drawingService.saveFcmToken({ userId, token });
    res.status(200).send("FCM token saved successfully");
  } catch (error) {
    console.error("Error saving FCM token:", error);
    res.status(500).send("Internal Server Error");
  }
});

app.listen(port, "0.0.0.0", () => {
  console.log(`Server running on http://localhost:${port}`);
});
