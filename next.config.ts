import type { NextConfig } from "next";
import { securityHeaders } from "./src/security/headers/security-headers";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // HiGHS (goal programming) loads its WebAssembly from beside its own file: Node requires it from node_modules.
  serverExternalPackages: ["highs"],
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
