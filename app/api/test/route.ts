import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  console.log("Triggered by scheduler (chronicle)");
  return NextResponse.json(
    {
      triggered: "by scheduler(chronicles)",
    },
    {
      status: 200,
    },
  );
}
