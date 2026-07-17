"use server";

import { prisma } from "@/lib/prisma";
import { isGemReference } from "@/lib/tender-columns";

const GEM_DIRECT_MAP: Record<string, string> = {
  tenderNoNitNo: "referenceNo",
  nameOfTheClient: "organization",
  lastDateOfSubmission: "deadline",
  tenderFor: "tenderBrief",
  costOfTenderFeeRs: "documentFees",
  emdAmountRs: "emd",
  estimatedCostRs: "estimatedBidValue",
  tenderOpeningDate: "bidOpeningDateTime",
  bidValidityDays: "bidOfferValidity",
  contractPeriodDays: "contractPeriod",
  typeOfTender: "typeOfBid",
  totalQuantityMeter: "totalQuantity",
  currentStatus: "bidStatus",
  docketNo: "docketNo",
  attachmentUrl: "attachmentUrl",
  remarks: "remarks",
};

const NON_GEM_DIRECT_MAP: Record<string, string> = {
  tenderNoNitNo: "referenceNo",
  nameOfTheClient: "organization",
  lastDateOfSubmission: "deadline",
  tenderFor: "tenderBrief",
  costOfTenderFeeRs: "documentFees",
  emdAmountRs: "emd",
  estimatedCostRs: "estimatedBidValue",
  totalQuantityMeter: "quantity",
  currentStatus: "sheetStatus",
  docketNo: "docketNo",
  attachmentUrl: "attachmentUrl",
  remarks: "remarks",
};

const SKIP_FIELDS = new Set(["id", "createdAt", "updatedAt"]);

export interface ImportEpcResult {
  fileId: number;
  gemInserted: number;
  nonGemInserted: number;
  gemMerged: number;
  nonGemMerged: number;
  errors: { referenceNo: string; error: string }[];
}

function valToString(val: unknown): string | null {
  if (val === null || val === undefined) return null;
  if (val instanceof Date) return val.toISOString().split("T")[0];
  return String(val);
}

function pickLatestDate(
  a: Date | null | undefined,
  b: Date | null | undefined
): Date | null {
  if (!a && !b) return null;
  if (!a) return b ?? null;
  if (!b) return a;
  return a > b ? a : b;
}

function buildExtraFields(
  tender: Record<string, unknown>,
  directMap: Record<string, string>
): { fieldName: string; fieldValue: string }[] {
  const directKeys = new Set(Object.keys(directMap));
  const extras: { fieldName: string; fieldValue: string }[] = [];

  for (const [key, value] of Object.entries(tender)) {
    if (SKIP_FIELDS.has(key)) continue;
    if (directKeys.has(key)) continue;
    if (value === null || value === undefined) continue;

    extras.push({
      fieldName: key,
      fieldValue:
        value instanceof Date ? value.toISOString() : String(value),
    });
  }

  return extras;
}

function mergeExtraFields(
  oldExtras: { fieldName: string; fieldValue: string | null }[],
  newExtras: { fieldName: string; fieldValue: string }[]
): { fieldName: string; fieldValue: string }[] {
  const map = new Map<string, string>();
  for (const ef of oldExtras) {
    if (ef.fieldValue) map.set(ef.fieldName, ef.fieldValue);
  }
  for (const ef of newExtras) {
    map.set(ef.fieldName, ef.fieldValue);
  }
  return Array.from(map.entries()).map(([fieldName, fieldValue]) => ({
    fieldName,
    fieldValue,
  }));
}

interface GemPreservedData {
  tenderFileUrl: string | null;
  website: string | null;
  aiRelevanceValid: boolean | null;
  aiRelevanceReason: string | null;
  app: "YES" | "NO" | "NOT_DECIDED";
  aps: "YES" | "NO" | "NOT_DECIDED";
  apm: "YES" | "NO" | "NOT_DECIDED";
  totalQuantity: string | null;
  itemCategory: string | null;
  parseStatus: string | null;
  parseError: string | null;
  deadline: Date | null;
  extraFields: { fieldName: string; fieldValue: string | null }[];
  tenderAssociations: { associationId: number }[];
  reportings: { officer: string; address: string | null; quantity: string | null }[];
  evaluations: { sellerName: string; offeredItem: string | null; totalPrice: string | null; rank: string | null; status: string | null }[];
}

interface NonGemPreservedData {
  tenderFileUrl: string | null;
  website: string | null;
  aiRelevanceValid: boolean | null;
  aiRelevanceReason: string | null;
  app: "YES" | "NO" | "NOT_DECIDED";
  aps: "YES" | "NO" | "NOT_DECIDED";
  apm: "YES" | "NO" | "NOT_DECIDED";
  deadline: Date | null;
  extraFields: { fieldName: string; fieldValue: string | null }[];
  tenderAssociations: { associationId: number }[];
}

function buildGemData(tender: Record<string, unknown>, fileId: number) {
  return {
    referenceNo: tender.tenderNoNitNo as string,
    tenderBrief: (tender.tenderFor as string) || null,
    deadline: (tender.lastDateOfSubmission as Date) || null,
    organization: (tender.nameOfTheClient as string) || null,
    documentFees: valToString(tender.costOfTenderFeeRs),
    emd: valToString(tender.emdAmountRs),
    estimatedBidValue: valToString(tender.estimatedCostRs),
    bidOpeningDateTime: valToString(tender.tenderOpeningDate),
    bidOfferValidity: valToString(tender.bidValidityDays),
    contractPeriod: valToString(tender.contractPeriodDays),
    typeOfBid: (tender.typeOfTender as string) || null,
    totalQuantity: valToString(tender.totalQuantityMeter),
    bidStatus: (tender.currentStatus as string) || null,
    docketNo: (tender.docketNo as string) || null,
    attachmentUrl: (tender.attachmentUrl as string) || null,
    remarks: (tender.remarks as string) || null,
    fileId,
  };
}

function buildNonGemData(tender: Record<string, unknown>, fileId: number) {
  return {
    referenceNo: tender.tenderNoNitNo as string,
    tenderBrief: (tender.tenderFor as string) || null,
    deadline: (tender.lastDateOfSubmission as Date) || null,
    organization: (tender.nameOfTheClient as string) || null,
    documentFees: valToString(tender.costOfTenderFeeRs),
    emd: valToString(tender.emdAmountRs),
    estimatedBidValue: valToString(tender.estimatedCostRs),
    quantity: valToString(tender.totalQuantityMeter),
    sheetStatus: (tender.currentStatus as string) || null,
    docketNo: (tender.docketNo as string) || null,
    attachmentUrl: (tender.attachmentUrl as string) || null,
    remarks: (tender.remarks as string) || null,
    fileId,
  };
}

function defaultGemPreserved(): GemPreservedData {
  return {
    tenderFileUrl: null,
    website: null,
    aiRelevanceValid: null,
    aiRelevanceReason: null,
    app: "NOT_DECIDED",
    aps: "NOT_DECIDED",
    apm: "NOT_DECIDED",
    totalQuantity: null,
    itemCategory: null,
    parseStatus: null,
    parseError: null,
    deadline: null,
    extraFields: [],
    tenderAssociations: [],
    reportings: [],
    evaluations: [],
  };
}

function buildMergedGemData(
  tender: Record<string, unknown>,
  preserved: GemPreservedData | null,
  fileId: number
) {
  const p = preserved ?? defaultGemPreserved();
  const base = buildGemData(tender, fileId);
  return {
    ...base,
    deadline: pickLatestDate(p.deadline, base.deadline),
    tenderFileUrl: p.tenderFileUrl,
    website: p.website,
    aiRelevanceValid: p.aiRelevanceValid,
    aiRelevanceReason: p.aiRelevanceReason,
    app: p.app,
    aps: p.aps,
    apm: p.apm,
    totalQuantity: p.totalQuantity ?? base.totalQuantity,
    itemCategory: p.itemCategory,
    parseStatus: p.parseStatus,
    parseError: p.parseError,
  };
}

function buildMergedNonGemData(
  tender: Record<string, unknown>,
  preserved: NonGemPreservedData | null,
  fileId: number
) {
  const p = preserved ?? {
    tenderFileUrl: null,
    website: null,
    aiRelevanceValid: null,
    aiRelevanceReason: null,
    app: "NOT_DECIDED" as const,
    aps: "NOT_DECIDED" as const,
    apm: "NOT_DECIDED" as const,
    deadline: null,
    extraFields: [],
    tenderAssociations: [],
  };
  const base = buildNonGemData(tender, fileId);
  return {
    ...base,
    deadline: pickLatestDate(p.deadline, base.deadline),
    tenderFileUrl: p.tenderFileUrl,
    website: p.website,
    aiRelevanceValid: p.aiRelevanceValid,
    aiRelevanceReason: p.aiRelevanceReason,
    app: p.app,
    aps: p.aps,
    apm: p.apm,
  };
}

function extractGemPreserved(old: any): GemPreservedData {
  return {
    tenderFileUrl: old.tenderFileUrl ?? null,
    website: old.website ?? null,
    aiRelevanceValid: old.aiRelevanceValid ?? null,
    aiRelevanceReason: old.aiRelevanceReason ?? null,
    app: old.app ?? "NOT_DECIDED",
    aps: old.aps ?? "NOT_DECIDED",
    apm: old.apm ?? "NOT_DECIDED",
    totalQuantity: old.totalQuantity ?? null,
    itemCategory: old.itemCategory ?? null,
    parseStatus: old.parseStatus ?? null,
    parseError: old.parseError ?? null,
    deadline: old.deadline ?? null,
    extraFields: old.extraFields ?? [],
    tenderAssociations:
      old.tenderAssociations?.map((ta: any) => ({
        associationId: ta.associationId,
      })) ?? [],
    reportings:
      old.reportings?.map((r: any) => ({
        officer: r.officer,
        address: r.address ?? null,
        quantity: r.quantity ?? null,
      })) ?? [],
    evaluations:
      old.evaluations?.map((e: any) => ({
        sellerName: e.sellerName,
        offeredItem: e.offeredItem ?? null,
        totalPrice: e.totalPrice ?? null,
        rank: e.rank ?? null,
        status: e.status ?? null,
      })) ?? [],
  };
}

function extractNonGemPreserved(old: any): NonGemPreservedData {
  return {
    tenderFileUrl: old.tenderFileUrl ?? null,
    website: old.website ?? null,
    aiRelevanceValid: old.aiRelevanceValid ?? null,
    aiRelevanceReason: old.aiRelevanceReason ?? null,
    app: old.app ?? "NOT_DECIDED",
    aps: old.aps ?? "NOT_DECIDED",
    apm: old.apm ?? "NOT_DECIDED",
    deadline: old.deadline ?? null,
    extraFields: old.extraFields ?? [],
    tenderAssociations:
      old.tenderAssociations?.map((ta: any) => ({
        associationId: ta.associationId,
      })) ?? [],
  };
}

export async function importEpcTendersAction(): Promise<ImportEpcResult> {
  const file = await prisma.file.create({
    data: { fileName: `EPC Import - ${new Date().toISOString()}` },
  });

  const [tenders, existingGems, existingNonGems] = await Promise.all([
    prisma.tender.findMany(),
    prisma.gemTender.findMany({
      select: { referenceNo: true },
    }),
    prisma.nonGemTender.findMany({
      select: { referenceNo: true },
    }),
  ]);

  if (tenders.length === 0) {
    return {
      fileId: file.id,
      gemInserted: 0,
      nonGemInserted: 0,
      gemMerged: 0,
      nonGemMerged: 0,
      errors: [],
    };
  }

  const gemRefSet = new Set(existingGems.map((r) => r.referenceNo.toLowerCase()));
  const nonGemRefSet = new Set(existingNonGems.map((r) => r.referenceNo.toLowerCase()));

  const newGemTenders: Record<string, unknown>[] = [];
  const newNonGemTenders: Record<string, unknown>[] = [];
  const dupGemTenders: { tender: Record<string, unknown>; refNo: string; preserved: GemPreservedData | null }[] = [];
  const dupNonGemTenders: { tender: Record<string, unknown>; refNo: string; preserved: NonGemPreservedData | null }[] = [];
  const errors: { referenceNo: string; error: string }[] = [];

  for (const tender of tenders) {
    const refNo = tender.tenderNoNitNo?.trim();
    if (!refNo) continue;

    const isGem = isGemReference(refNo);
    const refLower = refNo.toLowerCase();
    const inGem = gemRefSet.has(refLower);
    const inNonGem = nonGemRefSet.has(refLower);

    if (isGem && inGem) {
      dupGemTenders.push({
        tender: tender as unknown as Record<string, unknown>,
        refNo,
        preserved: null as any,
      });
    } else if (!isGem && inNonGem) {
      dupNonGemTenders.push({
        tender: tender as unknown as Record<string, unknown>,
        refNo,
        preserved: null as any,
      });
    } else if (inGem || inNonGem) {
      // Type mismatch: tender is classified as gem but exists in non-gem, or vice versa
      // Treat as a duplicate of the type it exists in
      if (inGem) {
        dupGemTenders.push({
          tender: tender as unknown as Record<string, unknown>,
          refNo,
          preserved: null as any,
        });
      } else {
        dupNonGemTenders.push({
          tender: tender as unknown as Record<string, unknown>,
          refNo,
          preserved: null as any,
        });
      }
    } else {
      if (isGem) {
        newGemTenders.push(tender as unknown as Record<string, unknown>);
      } else {
        newNonGemTenders.push(tender as unknown as Record<string, unknown>);
      }
    }
  }

  // Fetch old records with relations for duplicates
  const dupGemRefs = dupGemTenders.map((d) => d.refNo);
  const dupNonGemRefs = dupNonGemTenders.map((d) => d.refNo);

  const [oldGemRecords, oldNonGemRecords] = await Promise.all([
    dupGemRefs.length > 0
      ? prisma.gemTender.findMany({
          where: { referenceNo: { in: dupGemRefs } },
          include: {
            extraFields: true,
            tenderAssociations: true,
            reportings: true,
            evaluations: true,
          },
        })
      : Promise.resolve([]),
    dupNonGemRefs.length > 0
      ? prisma.nonGemTender.findMany({
          where: { referenceNo: { in: dupNonGemRefs } },
          include: {
            extraFields: true,
            tenderAssociations: true,
          },
        })
      : Promise.resolve([]),
  ]);

  const oldGemMap = new Map(oldGemRecords.map((r) => [r.referenceNo.toLowerCase(), r]));
  const oldNonGemMap = new Map(oldNonGemRecords.map((r) => [r.referenceNo.toLowerCase(), r]));

  for (const d of dupGemTenders) {
    const old = oldGemMap.get(d.refNo.toLowerCase());
    if (old) {
      d.preserved = extractGemPreserved(old);
    }
  }
  for (const d of dupNonGemTenders) {
    const old = oldNonGemMap.get(d.refNo.toLowerCase());
    if (old) {
      d.preserved = extractNonGemPreserved(old);
    }
  }

  // Build insert data arrays + extra field data arrays
  const newGemData: any[] = [];
  const newGemExtraFields: { refNo: string; extras: { fieldName: string; fieldValue: string }[] }[] = [];

  for (const tender of newGemTenders) {
    newGemData.push(buildGemData(tender, file.id));
    newGemExtraFields.push({
      refNo: tender.tenderNoNitNo as string,
      extras: buildExtraFields(tender, GEM_DIRECT_MAP),
    });
  }

  const newNonGemData: any[] = [];
  const newNonGemExtraFields: { refNo: string; extras: { fieldName: string; fieldValue: string }[] }[] = [];

  for (const tender of newNonGemTenders) {
    newNonGemData.push(buildNonGemData(tender, file.id));
    newNonGemExtraFields.push({
      refNo: tender.tenderNoNitNo as string,
      extras: buildExtraFields(tender, NON_GEM_DIRECT_MAP),
    });
  }

  const mergedGemData: any[] = [];
  const mergedGemExtraFields: {
    refNo: string;
    extras: { fieldName: string; fieldValue: string }[];
  }[] = [];

  for (const d of dupGemTenders) {
    const newExtras = buildExtraFields(d.tender, GEM_DIRECT_MAP);
    const mergedExtras = d.preserved
      ? mergeExtraFields(d.preserved.extraFields, newExtras)
      : newExtras;

    mergedGemData.push(buildMergedGemData(d.tender, d.preserved, file.id));
    mergedGemExtraFields.push({ refNo: d.refNo, extras: mergedExtras });
  }

  const mergedNonGemData: any[] = [];
  const mergedNonGemExtraFields: {
    refNo: string;
    extras: { fieldName: string; fieldValue: string }[];
  }[] = [];

  for (const d of dupNonGemTenders) {
    const newExtras = buildExtraFields(d.tender, NON_GEM_DIRECT_MAP);
    const mergedExtras = d.preserved
      ? mergeExtraFields(d.preserved.extraFields, newExtras)
      : newExtras;

    mergedNonGemData.push(buildMergedNonGemData(d.tender, d.preserved, file.id));
    mergedNonGemExtraFields.push({ refNo: d.refNo, extras: mergedExtras });
  }

  // Collect preserved relations for re-creation after insert
  const preservedGemAssociations: { refNo: string; associationId: number }[] = [];
  const preservedGemReportings: { refNo: string; officer: string; address: string | null; quantity: string | null }[] = [];
  const preservedGemEvaluations: { refNo: string; sellerName: string; offeredItem: string | null; totalPrice: string | null; rank: string | null; status: string | null }[] = [];
  const preservedNonGemAssociations: { refNo: string; associationId: number }[] = [];

  for (const d of dupGemTenders) {
    if (d.preserved) {
      for (const ta of d.preserved.tenderAssociations) {
        preservedGemAssociations.push({ refNo: d.refNo, ...ta });
      }
      for (const r of d.preserved.reportings) {
        preservedGemReportings.push({ refNo: d.refNo, ...r });
      }
      for (const e of d.preserved.evaluations) {
        preservedGemEvaluations.push({ refNo: d.refNo, ...e });
      }
    }
  }

  for (const d of dupNonGemTenders) {
    if (d.preserved) {
      for (const ta of d.preserved.tenderAssociations) {
        preservedNonGemAssociations.push({ refNo: d.refNo, ...ta });
      }
    }
  }

  // Execute in a transaction
  await prisma.$transaction(async (tx) => {
    // Phase 1: Delete old duplicate records (cascade deletes relations)
    if (dupGemRefs.length > 0) {
      await tx.gemTender.deleteMany({
        where: { referenceNo: { in: dupGemRefs } },
      });
    }
    if (dupNonGemRefs.length > 0) {
      await tx.nonGemTender.deleteMany({
        where: { referenceNo: { in: dupNonGemRefs } },
      });
    }

    // Phase 2: Insert all records (new + merged) in bulk
    const allGemData = [...newGemData, ...mergedGemData];
    const allNonGemData = [...newNonGemData, ...mergedNonGemData];

    const createdGems =
      allGemData.length > 0
        ? await tx.gemTender.createManyAndReturn({ data: allGemData })
        : [];
    const createdNonGems =
      allNonGemData.length > 0
        ? await tx.nonGemTender.createManyAndReturn({ data: allNonGemData })
        : [];

    // Build refNo -> new ID lookup maps
    const gemIdMap = new Map<string, number>();
    for (const g of createdGems) {
      gemIdMap.set(g.referenceNo.toLowerCase(), g.id);
    }
    const nonGemIdMap = new Map<string, number>();
    for (const ng of createdNonGems) {
      nonGemIdMap.set(ng.referenceNo.toLowerCase(), ng.id);
    }

    // Phase 3: Create extra fields in bulk
    const allGemExtraData: { gemTenderId: number; fieldName: string; fieldValue: string }[] = [];
    const allNonGemExtraData: { nonGemTenderId: number; fieldName: string; fieldValue: string }[] = [];

    for (const item of newGemExtraFields) {
      const id = gemIdMap.get(item.refNo.toLowerCase());
      if (id) {
        for (const ef of item.extras) {
          allGemExtraData.push({
            gemTenderId: id,
            fieldName: ef.fieldName,
            fieldValue: ef.fieldValue,
          });
        }
      }
    }
    for (const item of mergedGemExtraFields) {
      const id = gemIdMap.get(item.refNo.toLowerCase());
      if (id) {
        for (const ef of item.extras) {
          allGemExtraData.push({
            gemTenderId: id,
            fieldName: ef.fieldName,
            fieldValue: ef.fieldValue,
          });
        }
      }
    }
    for (const item of newNonGemExtraFields) {
      const id = nonGemIdMap.get(item.refNo.toLowerCase());
      if (id) {
        for (const ef of item.extras) {
          allNonGemExtraData.push({
            nonGemTenderId: id,
            fieldName: ef.fieldName,
            fieldValue: ef.fieldValue,
          });
        }
      }
    }
    for (const item of mergedNonGemExtraFields) {
      const id = nonGemIdMap.get(item.refNo.toLowerCase());
      if (id) {
        for (const ef of item.extras) {
          allNonGemExtraData.push({
            nonGemTenderId: id,
            fieldName: ef.fieldName,
            fieldValue: ef.fieldValue,
          });
        }
      }
    }

    if (allGemExtraData.length > 0) {
      await tx.tenderExtraField.createMany({ data: allGemExtraData });
    }
    if (allNonGemExtraData.length > 0) {
      await tx.tenderExtraField.createMany({ data: allNonGemExtraData });
    }

    // Phase 4: Re-create tender associations in bulk
    const allGemAssocData: { gemTenderId: number; associationId: number }[] = [];
    const allNonGemAssocData: { nonGemTenderId: number; associationId: number }[] = [];

    for (const item of preservedGemAssociations) {
      const id = gemIdMap.get(item.refNo.toLowerCase());
      if (id) {
        allGemAssocData.push({ gemTenderId: id, associationId: item.associationId });
      }
    }
    for (const item of preservedNonGemAssociations) {
      const id = nonGemIdMap.get(item.refNo.toLowerCase());
      if (id) {
        allNonGemAssocData.push({ nonGemTenderId: id, associationId: item.associationId });
      }
    }

    if (allGemAssocData.length > 0) {
      await tx.tenderAssociation.createMany({ data: allGemAssocData });
    }
    if (allNonGemAssocData.length > 0) {
      await tx.tenderAssociation.createMany({ data: allNonGemAssocData });
    }

    // Phase 5: Re-create reportings in bulk
    if (preservedGemReportings.length > 0) {
      const gemReportingData: { gemTenderId: number; officer: string; address: string | null; quantity: string | null }[] =
        [];
      for (const item of preservedGemReportings) {
        const id = gemIdMap.get(item.refNo.toLowerCase());
        if (id) {
          gemReportingData.push({
            gemTenderId: id,
            officer: item.officer,
            address: item.address,
            quantity: item.quantity,
          });
        }
      }
      if (gemReportingData.length > 0) {
        await tx.reporting.createMany({ data: gemReportingData });
      }
    }

    // Phase 6: Re-create evaluations in bulk
    if (preservedGemEvaluations.length > 0) {
      const gemEvalData: { gemTenderId: number; sellerName: string; offeredItem: string | null; totalPrice: string | null; rank: string | null; status: string | null }[] =
        [];
      for (const item of preservedGemEvaluations) {
        const id = gemIdMap.get(item.refNo.toLowerCase());
        if (id) {
          gemEvalData.push({
            gemTenderId: id,
            sellerName: item.sellerName,
            offeredItem: item.offeredItem,
            totalPrice: item.totalPrice,
            rank: item.rank,
            status: item.status,
          });
        }
      }
      if (gemEvalData.length > 0) {
        await tx.evaluation.createMany({ data: gemEvalData });
      }
    }
  },{
    timeout:30000
  });

  const gemInserted = newGemTenders.length + dupGemTenders.length;
  const nonGemInserted = newNonGemTenders.length + dupNonGemTenders.length;

  return {
    fileId: file.id,
    gemInserted,
    nonGemInserted,
    gemMerged: dupGemTenders.length,
    nonGemMerged: dupNonGemTenders.length,
    errors,
  };
}
