import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const fromStr = request.nextUrl.searchParams.get("from");
    const toStr = request.nextUrl.searchParams.get("to");
    if (!fromStr || !toStr) {
      return NextResponse.json(
        { error: "from and to query parameters are required (YYYY-MM-DD)" },
        { status: 400 },
      );
    }

    const start = new Date(`${fromStr}T00:00:00.000`);
    const end = new Date(`${toStr}T23:59:59.999`);

    const files = await prisma.file.findMany({
      where: {
        updatedAt: {
          gte: start,
          lte: end,
        },
      },
    });

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
