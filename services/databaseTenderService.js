import { prisma } from "../prisma/prismaClient.js";

const cleanDate = (val) => {
  if (!val) return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
};

const cleanFloat = (val) => {
  if (val === null || val === undefined || val === "") return null;
  const num = parseFloat(val);
  return isNaN(num) ? null : num;
};

const cleanInt = (val) => {
  if (val === null || val === undefined || val === "") return null;
  const num = parseInt(val, 10);
  return isNaN(num) ? null : num;
};

const isDateToday = (dateVal) => {
  if (!dateVal) return false;
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return false;
  const today = new Date();
  return d.getDate() === today.getDate() &&
         d.getMonth() === today.getMonth() &&
         d.getFullYear() === today.getFullYear();
};

const isRecordModified = (sheet, db) => {
  const fields = [
    { name: "slNo", type: "int" },
    { name: "docketNo", type: "string" },
    { name: "tenderFor", type: "string" },
    { name: "typeOfTender", type: "string" },
    { name: "nameOfWorkDescription", type: "string" },
    { name: "totalQuantityMeter", type: "float" },
    { name: "nameOfTheClient", type: "string" },
    { name: "lastDateOfSubmission", type: "date" },
    { name: "tenderOpeningDate", type: "date" },
    { name: "costOfTenderFeeRs", type: "float" },
    { name: "emdAmountRs", type: "float" },
    { name: "estimatedCostRs", type: "float" },
    { name: "bidValidityDays", type: "int" },
    { name: "contractPeriodDays", type: "int" },
    { name: "managementDecision", type: "string" },
    { name: "participated", type: "boolean" },
    { name: "tenderPrepareBy", type: "string" },
    { name: "currentStatus", type: "string" },
    { name: "tenderSubmittedDate", type: "date" },
    { name: "reverseAuctionApplicable", type: "boolean" },
    { name: "reverseAuctionDate", type: "date" },
    { name: "emdPaymentMode", type: "string" },
    { name: "bgNoUtrNo", type: "string" },
    { name: "emdValidity", type: "date" },
    { name: "loiPoNoAndDate", type: "string" },
    { name: "remarks", type: "string" },
    { name: "bidValidityExpired", type: "boolean" },
    // diffPercentFromL1 / L2 are skipped here when their manual-edit flag is set.
    // They are conditionally added below based on the db record's flags.
    { name: "reason", type: "string" },
    { name: "finalRemarks", type: "string" },
    { name: "attachmentUrl", type: "string" }
  ];

  // Conditionally include diff fields only when they have NOT been manually overridden
  if (!db.diffL1ManuallyEdited) {
    fields.push({ name: "diffPercentFromL1", type: "float" });
  }
  if (!db.diffL2ManuallyEdited) {
    fields.push({ name: "diffPercentFromL2", type: "float" });
  }

  for (const field of fields) {
    let sheetVal = sheet[field.name];
    let dbVal = db[field.name];

    if (field.type === "date") {
      const t1 = sheetVal ? new Date(sheetVal).getTime() : null;
      const t2 = dbVal ? new Date(dbVal).getTime() : null;
      const isT1NaN = !t1 || isNaN(t1);
      const isT2NaN = !t2 || isNaN(t2);
      if (isT1NaN && isT2NaN) continue;
      if (isT1NaN || isT2NaN || t1 !== t2) return true;
    } else if (field.type === "int") {
      const v1 = sheetVal !== null && sheetVal !== undefined && sheetVal !== "" ? parseInt(sheetVal, 10) : null;
      const v2 = dbVal !== null && dbVal !== undefined && dbVal !== "" ? parseInt(dbVal, 10) : null;
      const isV1NaN = v1 === null || isNaN(v1);
      const isV2NaN = v2 === null || isNaN(v2);
      if (isV1NaN && isV2NaN) continue;
      if (isV1NaN || isV2NaN || v1 !== v2) return true;
    } else if (field.type === "float") {
      const v1 = sheetVal !== null && sheetVal !== undefined && sheetVal !== "" ? parseFloat(sheetVal) : null;
      const v2 = dbVal !== null && dbVal !== undefined && dbVal !== "" ? parseFloat(dbVal) : null;
      const isV1NaN = v1 === null || isNaN(v1);
      const isV2NaN = v2 === null || isNaN(v2);
      if (isV1NaN && isV2NaN) continue;
      if (isV1NaN || isV2NaN || v1 !== v2) return true;
    } else if (field.type === "boolean") {
      const v1 = sheetVal === null || sheetVal === undefined ? null : Boolean(sheetVal);
      const v2 = dbVal === null || dbVal === undefined ? null : Boolean(dbVal);
      if (v1 !== v2) return true;
    } else {
      const v1 = (sheetVal || "").toString().trim();
      const v2 = (dbVal || "").toString().trim();
      if (v1 !== v2) return true;
    }
  }

  return false;
};

export class DatabaseTenderService {
  /**
   * Upsert a list of tenders to PostgreSQL.
   * Only triggers comparisons and writes if the record counts mismatch or if any record contains today's date.
   */
  static async upsertTenders(records) {
    if (!prisma) {
      console.warn("[DatabaseTenderService] Prisma client unavailable; skipping database sync.");
      return;
    }

    const validRecords = records.filter(r => r.tenderNoNitNo && r.tenderNoNitNo.trim() !== "");
    
    // 1. Fetch current database count (takes < 5ms)
    const dbCount = await prisma.tender.count();
    const countMismatch = validRecords.length !== dbCount;

    // 2. Check if any record in the sheet has today's date
    const hasTodayDate = validRecords.some(r => 
      isDateToday(r.tenderSubmittedDate) || 
      isDateToday(r.lastDateOfSubmission) ||
      isDateToday(r.tenderOpeningDate) ||
      isDateToday(r.reverseAuctionDate) ||
      isDateToday(r.emdValidity)
    );

    if (!countMismatch && !hasTodayDate) {
      console.log(`[DatabaseTenderService] Skipped database sync. DB count matches sheet count (${dbCount}) and no Google Sheet records contain today's date.`);
      return;
    }

    console.log(`[DatabaseTenderService] Database sync triggered (Count mismatch: ${countMismatch}, Has today's date: ${hasTodayDate}). Comparing ${validRecords.length} records...`);
    
    // Fetch all existing database records to compare
    const existingList = await prisma.tender.findMany();
    const existingMap = new Map();
    existingList.forEach(item => {
      existingMap.set(item.tenderNoNitNo, item);
    });

    let insertedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;

    for (const record of validRecords) {
      const dbRecord = existingMap.get(record.tenderNoNitNo);

      const data = {
        slNo: cleanInt(record.slNo) || 0,
        docketNo: record.docketNo || "",
        tenderFor: record.tenderFor || "",
        typeOfTender: record.typeOfTender || "",
        tenderNoNitNo: record.tenderNoNitNo,
        nameOfWorkDescription: record.nameOfWorkDescription || null,
        totalQuantityMeter: cleanFloat(record.totalQuantityMeter),
        nameOfTheClient: record.nameOfTheClient || "",
        lastDateOfSubmission: cleanDate(record.lastDateOfSubmission),
        tenderOpeningDate: cleanDate(record.tenderOpeningDate),
        costOfTenderFeeRs: cleanFloat(record.costOfTenderFeeRs),
        emdAmountRs: cleanFloat(record.emdAmountRs),
        estimatedCostRs: cleanFloat(record.estimatedCostRs),
        bidValidityDays: cleanInt(record.bidValidityDays),
        contractPeriodDays: cleanInt(record.contractPeriodDays),
        managementDecision: record.managementDecision || "Pending",
        participated: Boolean(record.participated),
        tenderPrepareBy: record.tenderPrepareBy || "",
        currentStatus: record.currentStatus || "",
        tenderSubmittedDate: cleanDate(record.tenderSubmittedDate),
        reverseAuctionApplicable: record.reverseAuctionApplicable === null ? null : Boolean(record.reverseAuctionApplicable),
        reverseAuctionDate: cleanDate(record.reverseAuctionDate),
        emdPaymentMode: record.emdPaymentMode || null,
        bgNoUtrNo: record.bgNoUtrNo || null,
        emdValidity: cleanDate(record.emdValidity),
        loiPoNoAndDate: record.loiPoNoAndDate || null,
        remarks: record.remarks || null,
        bidValidityExpired: Boolean(record.bidValidityExpired),
        // Preserve manually-edited diff values: if the DB record has a manual flag,
        // keep the existing DB value instead of overwriting from the sheet.
        diffPercentFromL1: (dbRecord && dbRecord.diffL1ManuallyEdited)
          ? dbRecord.diffPercentFromL1
          : cleanFloat(record.diffPercentFromL1),
        diffPercentFromL2: (dbRecord && dbRecord.diffL2ManuallyEdited)
          ? dbRecord.diffPercentFromL2
          : cleanFloat(record.diffPercentFromL2),
        reason: record.reason || null,
        finalRemarks: record.finalRemarks || null,
        attachmentUrl: record.attachmentUrl || null,
      };

      if (!dbRecord) {
        try {
          await prisma.tender.create({
            data,
          });
          insertedCount++;
        } catch (err) {
          console.error(`❌ CREATE FAILURE for new tender: ${record.tenderNoNitNo}`, err);
        }
      } else if (isRecordModified(record, dbRecord)) {
        try {
          await prisma.tender.update({
            where: { id: dbRecord.id },
            data,
          });
          updatedCount++;
        } catch (err) {
          console.error(`❌ UPDATE FAILURE for modified tender: ${record.tenderNoNitNo}`, err);
        }
      } else {
        skippedCount++;
      }
    }

    console.log(`[DatabaseTenderService] Sync Complete: ${insertedCount} inserted, ${updatedCount} updated, ${skippedCount} skipped.`);
  }

  /**
   * Retrieves all tenders from PostgreSQL.
   */
  static async getAllTenders() {
    if (!prisma) {
      console.warn("[DatabaseTenderService] Prisma client unavailable; returning empty tender list.");
      return [];
    }

    return prisma.tender.findMany({
      orderBy: {
        slNo: "asc",
      },
    });
  }

  /**
   * Updates only the two application-managed workflow fields.
   */
  static async updateTenderStatusAndAction(id, tenderUpdateStatus, nextAction, reverseAuctionApplicable) {
    if (!prisma) {
      console.warn("[DatabaseTenderService] Prisma client unavailable; skipping tender update.");
      return null;
    }

    const data = {
      tenderUpdateStatus,
      nextAction,
    };
    if (reverseAuctionApplicable !== undefined) {
      data.reverseAuctionApplicable = reverseAuctionApplicable;
    }
    return prisma.tender.update({
      where: { id },
      data,
    });
  }

  /**
   * Updates Diff % from L1 and/or Diff % from L2 as manually-edited values.
   * Sets the corresponding manual-edit flag(s) so the import sync will not overwrite them.
   * Pass `null` for a field to clear it and reset its flag.
   */
  static async updateDiffPercents(id, diffPercentFromL1, diffPercentFromL2) {
    if (!prisma) {
      console.warn("[DatabaseTenderService] Prisma client unavailable; skipping diff percent update.");
      return null;
    }

    const data = {};

    if (diffPercentFromL1 !== undefined) {
      data.diffPercentFromL1 = diffPercentFromL1 === null ? null : cleanFloat(diffPercentFromL1);
      // Null means the user cleared the value — reset the flag so the import can repopulate it
      data.diffL1ManuallyEdited = diffPercentFromL1 !== null;
    }

    if (diffPercentFromL2 !== undefined) {
      data.diffPercentFromL2 = diffPercentFromL2 === null ? null : cleanFloat(diffPercentFromL2);
      data.diffL2ManuallyEdited = diffPercentFromL2 !== null;
    }

    return prisma.tender.update({
      where: { id },
      data,
    });
  }
}
