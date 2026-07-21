import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { label, separator, fields } = body;

    const data: Record<string, unknown> = {};
    if (label !== undefined) data.label = label;
    if (separator !== undefined) data.separator = separator;
    if (fields !== undefined) {
      if (!Array.isArray(fields) || fields.length < 2) {
        return NextResponse.json(
          { error: "fields must be an array with at least 2 items" },
          { status: 400 },
        );
      }
      data.fields = JSON.stringify(fields);
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { error: "No fields to update" },
        { status: 400 },
      );
    }

    const group = await prisma.columnGroup.update({
      where: { id: parseInt(id, 10) },
      data,
    });

    return NextResponse.json({ group });
  } catch (error) {
    if ((error as any)?.code === "P2025") {
      return NextResponse.json(
        { error: "Group not found" },
        { status: 404 },
      );
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    await prisma.columnGroup.update({
      where: { id: parseInt(id, 10) },
      data: { status: "deleted" },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    if ((error as any)?.code === "P2025") {
      return NextResponse.json(
        { error: "Group not found" },
        { status: 404 },
      );
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 },
    );
  }
}
