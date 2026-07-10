import { createRequire } from "module";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import fs from "fs";
import path from "path";

let PrismaClient;

// Load .env variables before instantiating the pool to resolve ESM import hoisting issues
try {
  let envPath = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) {
    envPath = path.resolve("d:/tender-execuutive-dashboard", ".env");
  }
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, "utf-8");
    const regex = /^\s*([\w.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^#\n\r]*))/mg;
    let match;
    while ((match = regex.exec(envContent)) !== null) {
      const key = match[1];
      const value = match[2] || match[3] || match[4] || "";
      process.env[key] = value.trim();
    }
  }
} catch (e) {
  // Ignore
}

const require = createRequire(import.meta.url);

const generatedClientPath = path.resolve(process.cwd(), "app/generated/prisma/client.js");
const fallbackClientPath = path.resolve(process.cwd(), "node_modules/@prisma/client");

try {
  ({ PrismaClient } = require(generatedClientPath));
} catch (generatedErr) {
  try {
    ({ PrismaClient } = require("@prisma/client"));
  } catch (fallbackErr) {
    console.warn(`[Prisma] Could not load generated client at ${generatedClientPath}: ${generatedErr.message}`);
    console.warn(`[Prisma] Could not load @prisma/client fallback: ${fallbackErr.message}`);
    PrismaClient = null;
  }
}

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1,
  connectionTimeoutMillis: 15000,
});

const adapter = new PrismaPg(pool);

export const prisma = PrismaClient
  ? new PrismaClient({ adapter })
  : null;
