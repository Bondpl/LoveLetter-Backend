const isProduction = process.env.NODE_ENV === "prod";

export const config = {
  isProduction,
  rateLimits: {
    // Auth endpoints (/api/auth/anonymous, /api/pairs/join)
    // Prod: 6 req/min
    // Dev: 60 req/min
    authMax: isProduction ? 6 : 60,
    authWindowMs: 60 * 1000, // 1 minute

    // Drawing upload requests
    // Prod: 3 req/min
    // Dev: 30 req/min
    drawingMax: isProduction ? 3 : 30,
    drawingWindowMs: 60 * 1000, // 1 minute
  },
};
