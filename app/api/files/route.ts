import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const files = await prisma.file.findMany();
    return NextResponse.json({ files });
  } catch (error) {
    console.error("Files fetch error:", error instanceof Error ? error.message : error, error instanceof Error ? error.stack : "");
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 },
    );
  }
}
