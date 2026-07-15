import { NextRequest, NextResponse } from "next/server";
import { DatabaseSupplyService } from "@/services/databaseSupplyService";
import { fetchSupplyHistoryFromGoogleSheet } from "@/services/supplySheetService";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const forceFresh = req.nextUrl.searchParams.get("fresh") === "true";

  // 1. DB-first (unless force fresh)
  if (!forceFresh) {
    try {
      const dbData = await DatabaseSupplyService.getAllSupplyHistory();
      const withDocs = DatabaseSupplyService.enrichWithDocumentStatus(dbData);
      if (withDocs && withDocs.length > 0) {
        return NextResponse.json({ success: true, data: withDocs });
      }
    } catch (err: any) {
      console.warn("[API:GET /api/supply-history] DB fetch failed:", err.message);
    }
  }

  // 2. Fetch from Google Sheets
  try {
    const records = await fetchSupplyHistoryFromGoogleSheet();
    // 3. Upsert to DB (fire-and-forget)
    DatabaseSupplyService.upsertSupplyHistory(records).catch((err: any) =>
      console.error("[API:GET /api/supply-history] DB upsert error:", err.message)
    );
    const withDocs = DatabaseSupplyService.enrichWithDocumentStatus(records);
    return NextResponse.json({ success: true, data: withDocs });
  } catch (err: any) {
    console.warn("[API:GET /api/supply-history] Google Sheets fetch failed:", err.message);

    // Fallback to stale cache file
    try {
      const fs = await import("fs");
      const path = await import("path");
      const cachePath = path.resolve(process.cwd(), "data", "supply_history_cache.json");
      if (fs.existsSync(cachePath)) {
        const raw = fs.readFileSync(cachePath, "utf-8");
        const cached = JSON.parse(raw);
        return NextResponse.json({ success: true, data: cached });
      }
    } catch {}

    return NextResponse.json({ success: false, error: err.message, data: [] });
  }
}
