import { Pool } from "pg";
import process from "process";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL environment variable is not set");
  process.exit(1);
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

pool.on("error", (err) => {
  console.error("Database pool error:", err);
  process.exit(1);
});

pool.on("connect", () => {
  console.log("Database connected");
});
