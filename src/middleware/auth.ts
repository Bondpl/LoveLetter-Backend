import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { JwtPayload } from "../types/Auth";

export const requireAuth = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.split(" ")[1];

    if (!token) {
      return res.status(401).send("Unauthorized: Malformed Bearer Token");
    }

    const secret = process.env.JWT_SECRET || "local_jwt_secret_key";

    try {
      const decoded = jwt.verify(token, secret) as unknown as JwtPayload;
      req.userId = decoded.userId;
      return next();
    } catch (err) {
      return res.status(401).send("Invalid or expired JWT token");
    }
  }
};
