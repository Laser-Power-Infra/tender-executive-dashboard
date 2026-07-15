import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg", "pg", "smartsheet"],
};
module.exports = {
  allowedDevOrigins: ['192.168.1.200'],
}

export default nextConfig;
