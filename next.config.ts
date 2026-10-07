import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Pin the workspace root to this project so Turbopack ignores the
  // package-lock.json that lives in the parent home directory.
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
