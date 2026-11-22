import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "@prisma/client",
    "@prisma/adapter-pg",
    "pg",
  ],
   output: "standalone", 
  experimental: {
    authInterrupts: true,
  },
  allowedDevOrigins: ["192.168.1.200", "192.168.1.229"],
  // The MCP consent page must not load inside another site's frame (clickjacking the Allow button).
  async headers() {
    return [
      {
        source: "/oauth/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
        ],
      },
    ];
  },
};

export default nextConfig;
