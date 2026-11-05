import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every POS screen is personal to the logged-in user, so we render pages
  // fresh on each request instead of using Next.js "Cache Components".
  cacheComponents: false,
  turbopack: {
    // This folder is the project root (stops Next.js picking up a stray
    // package-lock.json from your user folder).
    root: process.cwd(),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // Don't advertise the framework in response headers
  poweredByHeader: false,
};

export default nextConfig;
