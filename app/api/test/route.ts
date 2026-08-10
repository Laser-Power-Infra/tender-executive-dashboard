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
export async function GET(request: NextRequest) {
  const response = await fetch(
    "http://evolution-api:8080/message/sendText/Bidyut%20Kr.%20Das",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: process.env.EVOLUTION_API_KEY!,
      },
      body: JSON.stringify({
        number: "120363425898868905@g.us",
        text: "🚨 New Tender Available\n\nTender No: ABC123\nDeadline: 15 August 2026",
      }),
    },
  );

  const data = await response.json();

  console.log(data);
}
