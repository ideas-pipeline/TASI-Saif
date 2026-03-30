import type { NextConfig } from "next";

const backendUrl =
  process.env.API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "https://api-production-08cb.up.railway.app";

const nextConfig: NextConfig = {
  transpilePackages: ["@sultan-saif/shared"],
  async rewrites() {
    return [
      {
        source: "/api/backend/:path*",
        destination: `${backendUrl}/:path*`,
      },
    ];
  },
};

export default nextConfig;
