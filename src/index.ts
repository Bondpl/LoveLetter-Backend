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

if (!process.env.FIREBASE_CREDENTIALS) {
  console.error("FIREBASE_CREDENTIALS environment variable is not set");
  process.exit(1);
}

const serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS);

initializeApp({
  credential: cert(serviceAccount),
});

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

app.post("/api/drawings", requireAuth, async (req, res) => {
  try {
    const senderId = req.userId!;
    const partnerUserId =
      senderId === process.env.API_KEY1
        ? process.env.API_KEY2
        : process.env.API_KEY1;

    if (!partnerUserId) {
      return res.status(400).send("Partner API key is missing");
    }

    const drawingBuffer = req.body;

    await drawingService.addNewDrawing({
      senderId,
      drawingBuffer,
      partnerUserId,
    });
    res.status(200).send("Drawing saved successfully");
  } catch (error) {
    console.error("Error saving drawing:", error);
    res.status(500).send("Internal Server Error");
  }
});

app.get("/api/drawings", requireAuth, async (req, res) => {
  try {
    const myUserId = req.userId!;

    const newDrawing = await drawingService.getNewDrawing({ userId: myUserId });
    if (newDrawing) {
      res.setHeader("Content-Type", "image/png");
      return res.status(200).send(newDrawing);
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
