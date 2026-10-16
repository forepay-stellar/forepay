import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The e2e server builds into its own folder (playwright.config.ts), so it can run while `next dev`
  // is running here: Next allows one dev server per build folder.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
