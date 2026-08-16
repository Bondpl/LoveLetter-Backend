# LoveLetter Backend

[![Node.js](https://img.shields.io/badge/Node.js-20.x-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Express](https://img.shields.io/badge/Express-5.2-000000?logo=express&logoColor=white)](https://expressjs.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-DB-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Firebase](https://img.shields.io/badge/Firebase-FCM-FFCA28?logo=firebase&logoColor=black)](https://firebase.google.com/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker&logoColor=white)](https://www.docker.com/)

A lightweight, robust backend service designed to support the **LoveLetter Kotlin Android application**. This backend enables paired users (couples) to send hand-drawn notes/drawings to each other in real-time, stores binary image payloads with automatic expiration, and delivers push notifications via Firebase Cloud Messaging (FCM).

---

## Features

- **Drawing Exchange**: Upload binary PNG drawing data (up to 5MB) and fetch the latest drawing sent by your partner.
- **Push Notifications**: Instant FCM (Firebase Cloud Messaging) alerts sent to your partner's Android app upon receiving a new drawing note.
- **Auto Expiration & Cleanup**: Drawings automatically expire after 3 days (`expires_at`), with automated DB cleanup routines executed on subsequent uploads.
- **Pair-Based Authentication**: Secure header-based authentication mechanism (`api_key`) linking two specific key holders (`API_KEY1` & `API_KEY2`).
- **PostgreSQL Integration**: Efficient storage of raw binary drawing byte arrays (`BYTEA`) and FCM token mappings.
- **Dockerized**: Pre-configured Docker setup ready for deployment on platforms like Google Cloud Run, Railway, Render, or self-hosted servers.

---

## Technology Stack

| Technology             | Description              |
| :--------------------- | :----------------------- |
| **Runtime**            | Node.js (v20+)           |
| **Language**           | TypeScript (v5.7)        |
| **Framework**          | Express.js (v5.2)        |
| **Database**           | PostgreSQL (`pg` driver) |
| **Push Notifications** | Firebase Admin SDK (FCM) |
| **Execution/Watch**    | `tsx`                    |

---

## Environment Variables

Create a `.env` file in the root directory based on `.env.example`:

```env
# Server Port
PORT=8080

# API Keys for Paired Users
API_KEY1=your_user_1_secret_api_key
API_KEY2=your_user_2_secret_api_key

# PostgreSQL Connection URL (Requires SSL support)
DATABASE_URL=postgres://user:password@hostname:5432/dbname

# Firebase Service Account JSON (Single-line escaped JSON string)
FIREBASE_CREDENTIALS={"type":"service_account","project_id":"...","private_key_id":"...","private_key":"...","client_email":"..."}
```

---

## Database Setup

The backend utilizes PostgreSQL for storing active drawings and FCM tokens.

Run the initialization script located in [`database/init.sql`](database/init.sql) on your PostgreSQL server:

```sql
CREATE TABLE IF NOT EXISTS drawings (
    id SERIAL PRIMARY KEY,
    sender_id VARCHAR(50) NOT NULL,
    image_data BYTEA NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX idx_drawings_lookup ON drawings(sender_id, expires_at);

CREATE TABLE IF NOT EXISTS fcm_tokens (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(50) NOT NULL UNIQUE,
    fcm_token TEXT NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

---

## API Reference

All requests require the `api_key` header set to either `API_KEY1` or `API_KEY2`.

### 1. Upload a Drawing

- **Endpoint:** `POST /api/drawings`
- **Headers:**
  - `api_key`: `<YOUR_API_KEY>`
  - `Content-Type`: `image/png`
- **Body:** Raw Binary Image Payload (PNG format, max size 5MB)
- **Response:** `200 OK` ("Drawing saved successfully")

### 2. Fetch Latest Drawing

- **Endpoint:** `GET /api/drawings`
- **Headers:**
  - `api_key`: `<YOUR_API_KEY>`
- **Response:**
  - `200 OK`: `image/png` binary content (returns partner's latest non-expired drawing)
  - `404 Not Found`: If no new active drawings are available

### 3. Register FCM Token

- **Endpoint:** `POST /api/fcm-token`
- **Headers:**
  - `api_key`: `<YOUR_API_KEY>`
  - `Content-Type`: `application/json`
- **Body:**
  ```json
  {
    "token": "your_firebase_fcm_device_token"
  }
  ```
- **Response:** `200 OK` ("FCM token saved successfully")

---

## Development & Execution

### Prerequisites

- Node.js (v20 or higher)
- PostgreSQL database
- Firebase project setup with FCM enabled

### Local Setup

1. **Install dependencies:**

   ```bash
   npm install
   ```

2. **Check TypeScript types:**

   ```bash
   npm run typecheck
   ```

3. **Start in production mode:**
   ```bash
   npm start
   ```

---

## Docker Deployment

To build and run the application container locally or in cloud providers:

1. **Build Docker Image:**

   ```bash
   docker build -t loveletter-backend .
   ```

2. **Run Docker Container:**
   ```bash
   docker run -d -p 8080:8080 --env-file .env loveletter-backend
   ```

---


## Architecture
  <p align="center">        
<img width="552" height="212" alt="Diagram drawio" src="https://github.com/user-attachments/assets/c3bac4c8-8d59-42be-b758-88893f8b4202" />
  </p>

---

## Future Improvements

- **Dynamic User Pairing (Multi-User Support)**: Transition from static paired API keys (`API_KEY1` and `API_KEY2`) to dynamic user pairing. Users will be able to generate unqiue invite codes (GUIDs) upon login and link accounts dynamically via code entry.
- **Unit & Integration Testing**: Implement test suites for `DrawingService` and middleware using Jest / Supertest to ensure API contract stability.

