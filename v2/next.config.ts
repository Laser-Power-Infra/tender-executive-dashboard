import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "@prisma/client",
    "@prisma/adapter-pg",
    "pg",
    "smartsheet",
  ],
};
module.exports = {
  allowedDevOrigins: ["192.168.1.200", "192.168.1.229"],
};

export default nextConfig;
