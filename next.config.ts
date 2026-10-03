import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Hide the tiny bottom-right "Rendering" / route badge in development.
  devIndicators: false,
  experimental: {
    serverActions: {
      bodySizeLimit: "1mb"
    }
  }
};

export default nextConfig;
