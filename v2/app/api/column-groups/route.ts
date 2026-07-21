import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity-logger";

export async function GET() {
  try {
    const groups = await prisma.columnGroup.findMany({
      where: { status: "active" },
      orderBy: { label: "asc" },
    });
    return NextResponse.json({ groups });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { label, separator, fields } = body;

    if (!label || !fields) {
      return NextResponse.json(
        { error: "label and fields are required" },
        { status: 400 },
      );
    }

    if (!Array.isArray(fields) || fields.length < 2) {
      return NextResponse.json(
        { error: "fields must be an array with at least 2 items" },
        { status: 400 },
      );
    }

    const group = await prisma.columnGroup.create({
      data: {
        label,
        separator: separator || " @ ",
        fields: JSON.stringify(fields),
      },
    });

    logActivity({
      action: "CREATE",
      tableName: "ColumnGroup",
      recordId: String(group.id),
      details: `Created column group "${label}" with ${fields.length} fields`,
    });

    return NextResponse.json({ group }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 },
    );
  }
}
