# mate-check (mobile)

React Native + Expo app for the mate-check talking-avatar POC. Pairs with the
[`mate-check-api`](../mate-check-api) backend.

## Stack

- Expo SDK 54, TypeScript, New Architecture
- NativeWind v4 (Tailwind for RN)
- `expo-speech-recognition` (on-device STT)
- `expo-video` (avatar clip playback)

## Setup

```bash
cp .env.example .env
# point EXPO_PUBLIC_API_URL at your backend
npm install
npx expo start
```

`expo-speech-recognition` is a config plugin and won't run in Expo Go. Use a
**dev client**:

```bash
npx expo run:android   # or run:ios
```

## Talking to the backend

The app reads `EXPO_PUBLIC_API_URL` and POSTs to:

- `POST /api/chat` → short (200–250 char) reply
- `POST /api/clip` → D-ID mp4 url

Local URLs that work:

- iOS simulator: `http://localhost:4000`
- Android emulator: `http://10.0.2.2:4000`
- Physical device on same Wi-Fi: `http://<lan-ip>:4000`
- Vercel deploy: `https://<your-project>.vercel.app`

## Flow

`User text or speech → /api/chat → reply → /api/clip → mp4 → expo-video plays it.`
