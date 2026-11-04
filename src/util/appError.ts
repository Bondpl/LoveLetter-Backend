export enum ErrorCode {
  // Client request & validation
  VALIDATION_ERROR = "VALIDATION_ERROR",
  INVALID_INPUT = "INVALID_INPUT",

  // Authentication & Authorization
  UNAUTHORIZED = "UNAUTHORIZED",
  TOKEN_REVOKED = "TOKEN_REVOKED",
  FORBIDDEN = "FORBIDDEN",
  NOT_IN_PAIR = "NOT_IN_PAIR",

  // Pairing logic
  PAIR_NOT_FOUND = "PAIR_NOT_FOUND",
  PAIR_FULL = "PAIR_FULL",
  PAIR_RACE_CONDITION = "PAIR_RACE_CONDITION",
  PAIR_GENERATION_FAILED = "PAIR_GENERATION_FAILED",

  // Drawings & Uploads
  DRAWING_NOT_FOUND = "DRAWING_NOT_FOUND",
  INVALID_FILE_KEY = "INVALID_FILE_KEY",
  FILE_NOT_FOUND = "FILE_NOT_FOUND",
  FILE_TOO_LARGE = "FILE_TOO_LARGE",

  // Notifications & Tokens
  FCM_TOKEN_REQUIRED = "FCM_TOKEN_REQUIRED",

  // Rate Limiting & Server Errors
  RATE_LIMIT_EXCEEDED = "RATE_LIMIT_EXCEEDED",
  INTERNAL_ERROR = "INTERNAL_ERROR",
}

export class AppError extends Error {
  code: ErrorCode;
  status: number;
  details?: unknown;

  constructor(
    code: ErrorCode,
    message: string,
    status: number = 400,
    details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status;
    this.details = details;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}
