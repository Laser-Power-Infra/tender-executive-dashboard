import { NextRequest, NextResponse } from "next/server";
import { DatabaseTenderService } from "@/services/databaseTenderService";
import { GoogleSheetService } from "@/services/googleSheetService";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const tenders = await DatabaseTenderService.getAllTenders();
    if (tenders && tenders.length > 0) {
      return NextResponse.json(tenders);
    }
  } catch (dbErr) {
    console.warn(
      "[API:GET /api/executive-tenders] DB fetch failed, trying Google Sheets:",
      dbErr,
    );
  }

  try {
    const sheetService = new GoogleSheetService();
    const records = await sheetService.fetchTenderRecords();
    if (records && records.length > 0) {
      return NextResponse.json(records);
    }
  } catch (sheetErr) {
    console.warn(
      "[API:GET /api/executive-tenders] Sheet fetch also failed:",
      sheetErr,
    );
  }

  return NextResponse.json([]);
}
