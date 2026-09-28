import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

interface JwtPayload {
  userId: string;
}

export const requireAuth = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.split(" ")[1];
    const secret = process.env.JWT_SECRET || "default_local_jwt_secret_key";

    try {
      const decoded = jwt.verify(token, secret) as JwtPayload;
      req.userId = decoded.userId;
      return next();
    } catch (err) {
      return res.status(401).send("Invalid or expired JWT token");
    }
  }

  // Fallback for legacy API keys during development
  const apiKey = req.headers["api_key"] as string | undefined;
  if (apiKey && (apiKey === process.env.API_KEY1 || apiKey === process.env.API_KEY2)) {
    req.userId = apiKey;
    return next();
  }

  return res.status(401).send("Unauthorized: Missing Bearer Token");
};
