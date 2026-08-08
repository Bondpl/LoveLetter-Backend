import type { Request, Response, NextFunction } from "express";

export const validateApiKey = (req: Request): string | null => {
  const apiKey = req.headers["api_key"] as string | undefined;

  const key1 = process.env.API_KEY1;
  const key2 = process.env.API_KEY2;

  if (!key1 || !key2) {
    console.warn(
      "[Warning] API_KEY1 or API_KEY2 is missing in environment variables!",
    );
  }

  if (!apiKey || (apiKey !== key1 && apiKey !== key2)) {
    return null;
  }

  return apiKey;
};

export const requireAuth = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const userId = validateApiKey(req);

  if (!userId) {
    return res.status(401).send("Unauthorized");
  }

  req.userId = userId;
  next();
};
