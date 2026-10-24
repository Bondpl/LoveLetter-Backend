import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { JwtPayload } from "../types/Auth";
import { AuthService } from "../auth/AuthService";
import { AppError } from "../util/appError";

export const readyMiddleware = (authService: AuthService) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.split(" ")[1];

      if (!token) {
        return res
          .status(401)
          .json({ error: "Unauthorized: Malformed Bearer Token", status: 401 });
      }

      const secret = process.env.JWT_SECRET || "local_jwt_secret_key";

      try {
        const decoded = jwt.verify(token, secret) as unknown as JwtPayload;

        const currentTokenVersion = await authService.getTokenVersion(
          decoded.userId,
        );

        if (currentTokenVersion !== Number(decoded.tokenVersion)) {
          throw new AppError(
            "Token has been revoked or user doesn't exist",
            401,
          );
        }

        req.userId = decoded.userId;
        return next();
      } catch (err) {
        if (err instanceof AppError) {
          return res
            .status(err.status)
            .json({ error: err.message, status: err.status });
        }
        return res
          .status(401)
          .json({ error: "Invalid or expired JWT token", status: 401 });
      }
    } else {
      return res
        .status(401)
        .json({ error: "Unauthorized: Missing Bearer Token", status: 401 });
    }
  };
};
