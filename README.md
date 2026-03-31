# EvCars - Smart EV Charging

A React Native (Expo) app for finding and booking EV charging stations, with an Express/MongoDB backend.

## Prerequisites

- [Node.js](https://nodejs.org/) (v18 or later)
- [Expo CLI](https://docs.expo.dev/get-started/installation/) (`npm install -g expo-cli`)
- [Expo Go](https://expo.dev/go) app on your phone
- A MongoDB Atlas cluster (or local MongoDB instance)

## Setup

### 1. Configure the backend

```bash
cd backend
cp .env.example .env
```

Open `backend/.env` and fill in your values:

- `MONGODB_URI` — your MongoDB connection string (e.g. `mongodb+srv://user:pass@cluster.mongodb.net/evcars`)
- `JWT_SECRET` — a random secret string (generate one with `openssl rand -hex 32`)

### 3. Install backend dependencies and seed a user

```bash
npm install
```

Before starting the server, seed an initial user (edit `backend/addUser.js` to set your desired username/password):

```bash
node addUser.js
```

### 4. Start the backend server

```bash
npm start
```

The server will run on `http://localhost:5000`.

### 5. Configure the frontend API URL

Open `config.js` in the project root and set `API_URL` to your backend address:

- **Android Emulator:** `http://10.0.2.2:5000`
- **iOS Simulator:** `http://localhost:5000`
- **Physical device:** `http://<YOUR_COMPUTER_IP>:5000` (find your IP with `ipconfig` on Windows or `ifconfig` on Mac/Linux) - IPv4 under your primary internet connection that you are using

### 6. Install frontend dependencies and start the app

```bash
cd ..
npm install
npx expo start
```

Scan the QR code with Expo Go (Android) or the Camera app (iOS) to open the app on your phone.
