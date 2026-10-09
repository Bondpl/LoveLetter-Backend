# LoveLetter Backend

[![Node.js](https://img.shields.io/badge/Node.js-20.x-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Express](https://img.shields.io/badge/Express-5.2-000000?logo=express&logoColor=white)](https://expressjs.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-DB-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Firebase](https://img.shields.io/badge/Firebase-FCM-FFCA28?logo=firebase&logoColor=black)](https://firebase.google.com/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker&logoColor=white)](https://www.docker.com/)

A lightweight, robust backend service designed to support the **LoveLetter Kotlin Android application**. This backend enables dynamically paired users (couples) to send hand-drawn notes/drawings to each other in real-time, stores images securely in S3-compatible storage with automatic expiration, and delivers push notifications via Firebase Cloud Messaging (FCM).

---

## Features

- **Dynamic User Pairing**: Users can create anonymous accounts and generate a 6-digit invite code to pair with a partner.
- **JWT Authentication with Token Versioning**: Secure `Bearer` token authentication. Utilizes a database-backed token versioning system allowing instant and robust token revocation in case of security breaches or account resets.
- **S3 Presigned URLs**: Secure, direct-to-cloud image uploads (up to 5MB). The backend generates short-lived presigned URLs for the client to upload images directly to AWS S3 / Neon Storage, minimizing server bandwidth.
- **Push Notifications**: Instant FCM (Firebase Cloud Messaging) alerts sent to your partner's Android app upon receiving a new drawing note.
- **Auto Expiration & Cleanup**: Drawings automatically expire after 3 days (`expires_at`), with automated DB cleanup routines executed on subsequent uploads.
- **Dockerized**: Pre-configured Docker setup ready for deployment on platforms like Google Cloud Run, Railway, Render, or self-hosted servers.

---

## Technology Stack

| Technology             | Description                                |
| :--------------------- | :----------------------------------------- |
| **Runtime**            | Node.js (v20+)                             |
| **Language**           | TypeScript (v5.7)                          |
| **Framework**          | Express.js (v5.2)                          |
| **Database**           | PostgreSQL (`pg` driver)                   |
| **Storage**            | AWS SDK v3 (S3 Client)                     |
| **Push Notifications** | Firebase Admin SDK (FCM)                   |
| **Authentication**     | JSON Web Tokens (`jsonwebtoken`)           |
| **Rate Limiting**      | Express Rate Limit & Redis (`ioredis`)     |

---

## Environment Variables

Create a `.env.local` or `.env` file in the root directory based on `.env.example`:

```env
# Server Port
PORT=8080

# JWT Secrets
JWT_SECRET=super_tajny_klucz_dla_aplikacji_loveletter_123

# PostgreSQL Connection URL
DATABASE_URL=postgresql://user:password@hostname:5432/dbname

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

## API Reference

All protected endpoints require the `Authorization` header set to `Bearer <YOUR_JWT_TOKEN>`.

### Authentication & Pairing

#### 1. Create Anonymous Account
- **Endpoint:** `POST /api/auth/anonymous`
- **Response:** `200 OK`
  ```json
  { "token": "jwt_token...", "pairCode": "123456", "userId": "uuid..." }
  ```

#### 2. Join a Pair
- **Endpoint:** `POST /api/pairs/join`
- **Body:** `{ "pairCode": "123456" }`
- **Response:** `200 OK`
  ```json
  { "token": "jwt_token...", "pairId": "uuid...", "userId": "uuid..." }
  ```

#### 3. Leave Pair (Requires Auth)
- **Endpoint:** `POST /api/pairs/leave`
- **Response:** `200 OK`
  ```json
  { "pairCode": "new_random_code_123456" }
  ```

### Drawings & Notifications

#### 1. Request S3 Upload URL
- **Endpoint:** `POST /api/drawings`
- **Response:** `200 OK`
  ```json
  { "S3URL": "https://...", "filekey": "drawings/..." }
  ```

#### 2. Confirm Upload & Notify Partner
- **Endpoint:** `POST /api/drawings/confirm`
- **Body:** `{ "filekey": "drawings/..." }`
- **Response:** `200 OK` ("Upload confirmed, saved to database and partner notified!")

#### 3. Fetch Latest Drawing
- **Endpoint:** `GET /api/drawings`
- **Response:** `200 OK`
  ```json
  { "drawingUrl": "https://s3-endpoint/bucket/drawings/...png" }
  ```

#### 4. Register FCM Token
- **Endpoint:** `POST /api/fcm-token`
- **Body:** `{ "token": "your_firebase_fcm_device_token" }`
- **Response:** `200 OK` ("FCM token saved successfully")

---

## Development & Execution

### Prerequisites

- Node.js (v20 or higher)
- PostgreSQL database
- Redis Server (for Rate Limiting)
- Firebase project setup with FCM enabled
- AWS S3 compatible object storage

### Local Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start in development mode:**
   ```bash
   npm run dev
   ```

3. **Check TypeScript types:**
   ```bash
   npm run typecheck
   ```

---

## Docker Deployment

To build and run the application container locally or in cloud providers:

1. **Start with Docker Compose (Recommended):**
   ```bash
   docker-compose up --build
   ```

2. **Standalone Docker Build:**
   ```bash
   docker build -t loveletter-backend .
   docker run -d -p 8080:8080 --env-file .env.local loveletter-backend
   ```
