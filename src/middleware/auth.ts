import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { JwtPayload } from "../types/Auth";
import { AuthService } from "../auth/AuthService";
import { AppError, ErrorCode } from "../util/appError";

export const readyMiddleware = (authService: AuthService) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.split(" ")[1];

      if (!token) {
        return next(
          new AppError(
            ErrorCode.UNAUTHORIZED,
            "Unauthorized: Malformed Bearer Token",
            401,
          ),
        );
      }

      const secret = process.env.JWT_SECRET;
      if (!secret) {
        return next(
          new AppError(
            ErrorCode.INTERNAL_ERROR,
            "Internal server error: JWT secret not configured",
            500,
          ),
        );
      }

      try {
        const decoded = jwt.verify(token, secret) as unknown as JwtPayload;

        const currentTokenVersion = await authService.getTokenVersion(
          decoded.userId,
        );

        if (currentTokenVersion !== Number(decoded.tokenVersion)) {
          return next(
            new AppError(
              ErrorCode.TOKEN_REVOKED,
              "Token has been revoked or user doesn't exist",
              401,
            ),
          );
        }

        req.userId = decoded.userId;
        return next();
      } catch (err) {
        if (err instanceof AppError) {
          return next(err);
        }
        return next(
          new AppError(
            ErrorCode.UNAUTHORIZED,
            "Invalid or expired JWT token",
            401,
          ),
        );
      }
    } else {
      return next(
        new AppError(
          ErrorCode.UNAUTHORIZED,
          "Unauthorized: Missing Bearer Token",
          401,
        ),
      );
    }
  };
};
