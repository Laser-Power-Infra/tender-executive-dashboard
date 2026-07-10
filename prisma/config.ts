// prisma/config.ts
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    // Connection URL is read from the same env var used before.
    url: process.env.DATABASE_URL!,
  },
  migrations: {
    path: "prisma/migrations",
  },
});
