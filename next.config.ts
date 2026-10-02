import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Explicitly expose custom env vars to the Next.js server runtime.
  // Amplify sets these at build time; this block makes them available
  // to API routes (server-side) at request time as well.
  env: {
    REGION: process.env.REGION ?? "us-east-1",
    ACCESS_KEY_ID: process.env.ACCESS_KEY_ID ?? "",
    SECRET_ACCESS_KEY: process.env.SECRET_ACCESS_KEY ?? "",
    AUDIO_BUCKET_NAME: process.env.AUDIO_BUCKET_NAME ?? "eduvoice-audio-vilas-2026",
    DYNAMODB_TABLE: process.env.DYNAMODB_TABLE ?? "EduVoice_Sessions",
    GROQ_API_KEY: process.env.GROQ_API_KEY ?? "",
    GROQ_MODEL: process.env.GROQ_MODEL ?? "",
  },
};

export default nextConfig;
