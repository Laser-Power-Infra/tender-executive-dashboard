import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { excelHeader, dbField, displayName } = body;

    const data: Record<string, unknown> = {};
    if (excelHeader !== undefined) data.excelHeader = excelHeader;
    if (dbField !== undefined) data.dbField = dbField;
    if (displayName !== undefined) data.displayName = displayName;

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { error: "No fields to update" },
        { status: 400 },
      );
    }

    const mapping = await prisma.columnMapping.update({
      where: { id: parseInt(id, 10) },
      data,
    });

    return NextResponse.json({ mapping });
  } catch (error) {
    if ((error as any)?.code === "P2025") {
      return NextResponse.json(
        { error: "Mapping not found" },
        { status: 404 },
      );
    }
    if ((error as any)?.code === "P2002") {
      return NextResponse.json(
        { error: "A mapping with this excelHeader and dbField already exists" },
        { status: 409 },
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
    await prisma.columnMapping.update({
      where: { id: parseInt(id, 10) },
      data: { status: "deleted" },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    if ((error as any)?.code === "P2025") {
      return NextResponse.json(
        { error: "Mapping not found" },
        { status: 404 },
      );
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 },
    );
  }
}
