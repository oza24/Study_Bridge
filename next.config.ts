import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // No env block needed — Next.js API routes read process.env at runtime automatically.
  // The env block bakes values at BUILD time which can override real runtime env vars.
};

export default nextConfig;

