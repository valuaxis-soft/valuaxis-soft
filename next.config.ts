import type { NextConfig } from "next";
import { securityHeaders } from "./src/security/headers/security-headers";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders({ development: process.env.NODE_ENV !== "production" }),
      },
    ];
  },
};

export default nextConfig;
