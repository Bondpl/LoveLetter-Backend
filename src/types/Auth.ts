import express from "express";

export interface AuthRequest extends express.Request {
  userId?: string;
}
