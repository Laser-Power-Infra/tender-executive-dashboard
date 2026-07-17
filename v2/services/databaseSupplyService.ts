import * as fs from "fs";
import * as path from "path";
import pLimit from "p-limit";
import { prisma } from "@/lib/prisma";
import type { SupplyHistoryRecord } from "@/types/supplyHistory";

export class DatabaseSupplyService {
  static async getAllSupplyHistory(): Promise<SupplyHistoryRecord[]> {
    if (!prisma) {
      console.warn("[DatabaseSupplyService] Prisma client unavailable");
      return [];
    }
    const records = await prisma.supplyHistory.findMany({
      orderBy: { createdAt: "desc" },
    });
    return records.map((r: any) => ({
      fy: r.fy,
      saleBillNumber: r.saleBillNumber,
      saleBillDate: r.saleBillDate,
      partyName: r.partyName,
      itemCode: r.itemCode,
      itemName: r.itemName,
      lrNo: r.lrNo,
      truckNo: r.truckNo,
      partyRefNo: r.partyRefNo,
      partyRefDate: r.partyRefDate,
      contractVrNo: r.contractVrNo,
      rate: r.rate,
      invoiceQty: r.invoiceQty,
      invoiceAmt: r.invoiceAmt,
      attachmentUrl: r.attachmentUrl,
    }));
  }

  static enrichWithDocumentStatus(
    records: SupplyHistoryRecord[],
  ): SupplyHistoryRecord[] {
    let supplyDocIndex: Record<string, boolean> = {};
    try {
      const dbPath = path.resolve(
        process.cwd(),
        "data",
        "supply_document_index.json",
      );
      if (fs.existsSync(dbPath)) {
        supplyDocIndex = JSON.parse(fs.readFileSync(dbPath, "utf-8"));
      }
    } catch (err) {
      console.warn(
        "[DatabaseSupplyService] Failed to load supply document index:",
        (err as Error).message,
      );
    }

    return records.map((r) => ({
      ...r,
      hasDocuments: !!(
        r.saleBillNumber &&
        supplyDocIndex[r.saleBillNumber.trim().toUpperCase()]
      ),
    }));
  }

  static async upsertSupplyHistory(
    records: SupplyHistoryRecord[],
  ): Promise<void> {
    if (!prisma || records.length === 0) return;

    const seen = new Set<string>();
    const deduped: SupplyHistoryRecord[] = [];
    for (const r of records) {
      if (r.invoiceQty !== null && r.invoiceQty <= 0) continue;
      const key = `${r.saleBillNumber ?? ""}|${r.itemCode ?? ""}`;
      if (key === "|") continue;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(r);
    }

    const limit = pLimit(10);

    const tasks = deduped.map((record) =>
      limit(async (): Promise<"inserted" | "updated"> => {
        const saleBillNumber = record.saleBillNumber || "";
        const itemCode = record.itemCode || "";

        const data: any = {
          fy: record.fy || null,
          saleBillNumber: saleBillNumber || null,
          saleBillDate: record.saleBillDate || null,
          partyName: record.partyName || null,
          itemCode: itemCode || null,
          itemName: record.itemName || null,
          lrNo: record.lrNo || null,
          truckNo: record.truckNo || null,
          partyRefNo: record.partyRefNo || null,
          partyRefDate: record.partyRefDate || null,
          contractVrNo: record.contractVrNo || null,
          rate: record.rate ?? null,
          invoiceQty: record.invoiceQty ?? null,
          invoiceAmt: record.invoiceAmt ?? null,
          lastSyncedAt: new Date(),
        };

        try {
          const result = await prisma!.supplyHistory.upsert({
            where: {
              saleBillNumber_itemCode: { saleBillNumber, itemCode },
            },
            create: data,
            update: data,
          });
          return result.createdAt.getTime() === result.updatedAt.getTime()
            ? "inserted"
            : "updated";
        } catch (err) {
          console.error(
            `[DatabaseSupplyService] Upsert failure for ${saleBillNumber}|${itemCode}:`,
            err,
          );
          return "updated";
        }
      }),
    );

    const results = await Promise.all(tasks);
    const inserted = results.filter((r) => r === "inserted").length;
    const updated = results.filter((r) => r === "updated").length;
    console.log(
      `[DatabaseSupplyService] Sync: ${inserted} inserted, ${updated} updated`,
    );
  }
}
