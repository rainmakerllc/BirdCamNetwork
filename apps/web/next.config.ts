import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export',
  images: {
    unoptimized: true,
  },
  // Trailing slashes for Firebase Hosting
  trailingSlash: true,
};

export default nextConfig;
