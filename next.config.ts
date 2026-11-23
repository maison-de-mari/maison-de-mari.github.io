import type { NextConfig } from "next";

// STATIC_EXPORT=1 — статический сайт для GitHub Pages (maison-de-mari.github.io, с корня)
const pages = process.env.STATIC_EXPORT === "1";

const nextConfig: NextConfig = {
  ...(pages
    ? {
        output: "export",
        trailingSlash: true,
        images: { unoptimized: true },
      }
    : {}),
  env: { NEXT_PUBLIC_BASE_PATH: "" },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
