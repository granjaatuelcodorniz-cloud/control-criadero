import type { NextConfig } from "next";
import { randomUUID } from "node:crypto";

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_OFFLINE_BUILD: process.env.VERCEL_DEPLOYMENT_ID ?? randomUUID(),
  },
  async headers() {
    return [{
      source: "/sw.js",
      headers: [{ key: "Cache-Control", value: "no-cache" }],
    }];
  },
};

export default nextConfig;
