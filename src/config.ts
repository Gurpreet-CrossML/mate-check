const fallback = "http://localhost:4000";

export const API_BASE_URL: string =
  (process.env.EXPO_PUBLIC_API_URL as string | undefined)?.replace(/\/$/, "") ||
  fallback;
