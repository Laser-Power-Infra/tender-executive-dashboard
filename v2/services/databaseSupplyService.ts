import * as fs from "fs";
import * as path from "path";
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
    }));
  }

  static enrichWithDocumentStatus(records: SupplyHistoryRecord[]): SupplyHistoryRecord[] {
    let supplyDocIndex: Record<string, boolean> = {};
    try {
      const dbPath = path.resolve(process.cwd(), "data", "supply_document_index.json");
      if (fs.existsSync(dbPath)) {
        supplyDocIndex = JSON.parse(fs.readFileSync(dbPath, "utf-8"));
      }
    } catch (err) {
      console.warn("[DatabaseSupplyService] Failed to load supply document index:", (err as Error).message);
    }

    return records.map((r) => ({
      ...r,
      hasDocuments: !!(r.saleBillNumber && supplyDocIndex[r.saleBillNumber.trim().toUpperCase()]),
    }));
  }

  static async upsertSupplyHistory(records: SupplyHistoryRecord[]): Promise<void> {
    if (!prisma || records.length === 0) return;

    let inserted = 0;
    let updated = 0;

    for (const record of records) {
      const saleBillNumber = record.saleBillNumber || "";
      const itemCode = record.itemCode || "";
      if (!saleBillNumber && !itemCode) continue;

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
        const existing = await prisma.supplyHistory.findFirst({
          where: { saleBillNumber, itemCode },
        });

        if (existing) {
          await prisma.supplyHistory.update({
            where: { id: existing.id },
            data,
          });
          updated++;
        } else {
          await prisma.supplyHistory.create({ data });
          inserted++;
        }
      } catch (err) {
        console.error(`[DatabaseSupplyService] Upsert failure:`, err);
      }
    }

    console.log(`[DatabaseSupplyService] Sync: ${inserted} inserted, ${updated} updated`);
  }
}
