# LoveLetter Backend

[![Node.js](https://img.shields.io/badge/Node.js-20.x-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Express](https://img.shields.io/badge/Express-5.2-000000?logo=express&logoColor=white)](https://expressjs.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-DB-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Redis](https://img.shields.io/badge/Redis-7-DC382D?logo=redis&logoColor=white)](https://redis.io/)
[![Firebase](https://img.shields.io/badge/Firebase-FCM-FFCA28?logo=firebase&logoColor=black)](https://firebase.google.com/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker&logoColor=white)](https://www.docker.com/)

A lightweight, robust backend service designed to support the **LoveLetter Kotlin Android application**. This backend enables dynamically paired couples to exchange hand-drawn notes and drawings in real-time. It features end-to-end encryption support (public key exchange & IV transmission), direct S3-compatible cloud storage via presigned URLs, Redis caching & per-user rate limiting, database-backed JWT token versioning, and push notifications via Firebase Cloud Messaging (FCM).

---

## Features

- **Dynamic Pairing & Public Key Exchange**: Users generate 6-digit invite codes to pair with a partner and exchange public keys for end-to-end encrypted notes.
- **JWT Authentication with Token Versioning**: Secure `Bearer` token authentication backed by database token versioning for instant token revocation.
- **S3 Presigned URLs**: Secure, direct-to-cloud image uploads (up to 5MB) via short-lived (60s) AWS S3 presigned URLs, reducing server bandwidth.
- **Redis Caching & Rate Limiting**: Latest drawings are cached in Redis for fast retrieval; drawing creation endpoints are rate-limited per user (6 requests/minute) using `rate-limit-redis`.
- **Push Notifications (FCM)**: Real-time alerts sent to the partner device via Firebase Admin SDK with automatic pruning of invalid/expired FCM tokens.
- **Auto Expiration & Cleanup**: Drawings automatically expire after 3 days (`expires_at`), with automated cleanup routines purging stale rows.
- **Dockerized Architecture**: Pre-configured `docker-compose.yml` orchestrating PostgreSQL, Redis, and the Node.js backend.

---

## Technology Stack

| Technology             | Description                                     |
| :--------------------- | :---------------------------------------------- |
| **Runtime**            | Node.js (v20+) / `tsx`                          |
| **Language**           | TypeScript (v5.7)                               |
| **Framework**          | Express.js (v5.2)                               |
| **Database**           | PostgreSQL (`pg` driver)                        |
| **Cache & Limiter**    | Redis 7 (`ioredis`, `rate-limit-redis`)         |
| **Object Storage**     | AWS SDK v3 (`@aws-sdk/client-s3`, presigner)     |
| **Push Notifications** | Firebase Admin SDK (FCM)                        |
| **Authentication**     | JSON Web Tokens (`jsonwebtoken`) with versioning |

---

## Environment Variables

Create a `.env.local` or `.env` file in the root directory based on `.env.example`:

```env
# Server Port
PORT=8080

# JWT Secret
JWT_SECRET=super_tajny_klucz_dla_aplikacji_loveletter_123

# PostgreSQL Connection URL
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/loveletter

# Redis Connection URL
REDIS_URL=redis://localhost:6379

# S3 Storage Configuration
S3_ENDPOINT=https://your-s3-endpoint.tech
S3_ACCESS_KEY_ID=your_access_key
S3_SECRET_ACCESS_KEY=your_secret_key
S3_REGION=eu-central-1
S3_BUCKET_NAME=loveletter-pictures

# Firebase Service Account JSON (Single-line escaped JSON string)
FIREBASE_CREDENTIALS={"type":"service_account","project_id":"...","private_key_id":"...","private_key":"...","client_email":"..."}
```

---

## API Endpoints

All protected endpoints require `Authorization: Bearer <JWT_TOKEN>`.

| Method | Endpoint | Auth | Body / Params | Description |
| :--- | :--- | :---: | :--- | :--- |
| `POST` | `/api/auth/anonymous` | No | `{ publicKey }` | Creates user & returns pair code + JWT |
| `POST` | `/api/pairs/join` | No | `{ pairCode, publicKey }` | Joins a pair & returns partner's public key |
| `GET` | `/api/pairs/status` | Yes | — | Returns pairing status and partner public key |
| `POST` | `/api/pairs/leave` | Yes | — | Leaves and deactivates current pair |
| `POST` | `/api/drawings` | Yes | — | Generates S3 presigned upload URL *(limit: 6/min)* |
| `POST` | `/api/drawings/confirm` | Yes | `{ filekey, iv }` | Confirms upload & notifies partner via FCM |
| `GET` | `/api/drawings` | Yes | — | Returns latest partner drawing (`imageUrl`, `iv`) |
| `POST` | `/api/fcm-token` | Yes | `{ fcmToken }` | Registers/updates FCM token for push notifications |

---

## Development & Execution

### Prerequisites

- **Node.js** (v20 or higher)
- **PostgreSQL** database
- **Redis** server (v7+)
- **AWS S3** or S3-compatible bucket (e.g., MinIO, Neon, Cloudflare R2)
- **Firebase Project** with Cloud Messaging enabled

### Local Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment:**
   Create `.env.local` in the project root with your credentials (see [Environment Variables](#environment-variables)).

3. **Run database migrations:**
   Initialize database schema using `database/init.sql`.

4. **Start in development mode (hot-reload):**
   ```bash
   npm run dev
   ```

5. **Type-check:**
   ```bash
   npm run typecheck
   ```

6. **Start production server:**
   ```bash
   npm start
   ```

---

## Docker Deployment

The repository includes a `docker-compose.yml` pre-configured with PostgreSQL, Redis, and the backend service:

```bash
# Start all services with Docker Compose
docker-compose up --build

# Run in background
docker-compose up -d
```

### Standalone Docker Build

```bash
# Build the container image
docker build -t loveletter-backend .

# Run container with environment file
docker run -d -p 8080:8080 --env-file .env.local loveletter-backend
```
