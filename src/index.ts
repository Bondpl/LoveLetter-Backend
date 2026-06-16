import express from "express";
import { DrawingRepository } from "./DrawingRepository";
import { pool } from "./dataBaseConnector";
import type { AuthRequest } from "./types/Auth";
import { initializeApp, cert } from "firebase-admin/app";

const serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS as string);

initializeApp({
  credential: cert(serviceAccount),
});

const app = express();
const port = process.env.PORT ? parseInt(process.env.PORT) : 8080;

app.use(express.json());
app.use(express.raw({ type: "image/png", limit: "5mb" }));

const requireAuth = (
  req: AuthRequest,
  res: express.Response,
  next: express.NextFunction,
) => {
  const apiKey = req.headers["api_key"] as string;
  if (apiKey === process.env.API_KEY1 || apiKey === process.env.API_KEY2) {
    req.userId = apiKey;
    next();
  } else {
    return res.status(401).send("Unauthorized");
  }
};

const drawingRepo = new DrawingRepository(pool);

app.post("/api/drawings", requireAuth, async (req: AuthRequest, res) => {
  try {
    const senderId = req.userId as string;
    await drawingRepo.saveDrawing(senderId, req.body);

    const partnerUserId =
      senderId === process.env.API_KEY1
        ? process.env.API_KEY2
        : process.env.API_KEY1;
    const partnerToken = await drawingRepo.getFCMToken(partnerUserId as string);

    if (partnerToken) {
      await drawingRepo.notifyPartner(partnerToken);
    }

    res.status(200).send("Drawing saved successfully");
  } catch (error) {
    console.error("Error saving drawing:", error);
    res.status(500).send("Internal Server Error");
  }
});

app.get("/api/drawings", requireAuth, async (req: AuthRequest, res) => {
  try {
    const myUserId = req.userId as string;

    const drawingBuffer = await drawingRepo.getLatestDrawing(myUserId);

    if (drawingBuffer) {
      res.setHeader("Content-Type", "image/png");
      res.status(200).send(drawingBuffer);
    } else {
      res.status(404).send("No new drawings found");
    }
  } catch (error) {
    console.error("Error fetching drawing:", error);
    res.status(500).send("Internal Server Error");
  }
});

app.post("/api/fcm-token", requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId as string;
    const { token } = req.body as { token: string };

    if (!token) {
      return res.status(400).send("FCM token is required");
    }

    await drawingRepo.saveFCMToken(userId, token);
    res.status(200).send("FCM token saved successfully");
  } catch (error) {
    console.error("Error saving FCM token:", error);
    res.status(500).send("Internal Server Error");
  }
});

app.listen(port, "0.0.0.0", () => {
  console.log(`Server running on http://localhost:${port}`);
});
