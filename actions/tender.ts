"use server";

import { prisma } from "@/lib/prisma";
import { sendTenderWebhook } from "@/lib/webhook";
import { withLog, logActivity } from "@/lib/activity-logger";
import { requireUserAction } from "@/lib/dal";
import {
  triggerEmdPaymentWebhook,
  resolveEmdAttachment,
  triggerReverseAuctionWebhook,
} from "@/lib/integrations/n8n";
import type {
  EmdWebhookAttachment,
  ReverseAuctionWebhookData,
} from "@/lib/integrations/n8n";
import { TENDER_FILE_TYPES } from "@/lib/tender-file-types";
import { describeTenderFile } from "@/lib/tenderFileDescriptor";
import { format } from "date-fns";
import { parseDate } from "@/lib/parse-date";
import { toISTDateKey } from "@/lib/format-ist";
import { calcDiffDecimal, calcDiffString } from "@/lib/diffCalculator";
import { parseEmd, parseRupees } from "@/lib/rupees";

export const updateTenderAssignmentsAction = withLog(
  async (params: {
    tenderMergedId: number;
    associationIds: number[];
  }) => {
    const user = await requireUserAction();
    const existing = await prisma.tenderAssociation.findFirst({
      where: { tenderMergedId: params.tenderMergedId },
      select: { id: true },
    });
    // Only a developer may change an assignment that is already made.
    const reassign = !!existing && user.role === "developer";
    if (existing && !reassign) {
      throw new Error(
        `Assignment is locked for tender #${params.tenderMergedId} because a person is already assigned`,
      );
    }
    await prisma.tenderAssociation.deleteMany({
      where: { tenderMergedId: params.tenderMergedId },
    });
    if (params.associationIds.length > 0) {
      await prisma.tenderAssociation.createMany({
        data: params.associationIds.map((associationId) => ({
          tenderMergedId: params.tenderMergedId,
          associationId,
        })),
      });
    }
    const tender = await prisma.tenderMerged.findUnique({
      where: { id: params.tenderMergedId },
      include: {
        tenderAssociations: { include: { association: true } },
        tenderFiles: true,
      },
    });
    // A developer's correction must not mail the new assignee again.
    if (
      !reassign &&
      tender &&
      tender.apm === "YES" &&
      tender.tenderAssociations.length > 0
    ) {
      const {
        referenceNo,
        itemCategory,
        organization,
        deadline,
      } = tender;

      console.dir(tender.tenderFiles);
      sendTenderWebhook(
        {
          referenceNo,
          itemCategory,
          organization,
          deadline,
          tenderFileUrl:
            tender.tenderFiles.find((t) =>
              t.tags.includes(TENDER_FILE_TYPES.TENDER_DOCUMENT),
            )?.url ?? "",
        },
        tender.tenderType === "GEM" ? "Gem" : "Non-Gem",
        tender.tenderAssociations,
      );
    }
    return {
      tenderMergedId: params.tenderMergedId,
      referenceNo: tender?.referenceNo ?? undefined,
    };
  },
  (result, params) => ({
    action: "UPDATE" as const,
    tableName: "TenderAssociation",
    recordId: String(params.tenderMergedId),
    referenceNo: result.referenceNo,
    details: `Updated assignees for tender #${params.tenderMergedId}: ${params.associationIds.length} association(s)`,
  }),
);

export async function updateTenderUtilityMapping(params: {
  tenderMergedId: number;
  website: string;
}) {
  await requireUserAction();
  const website = params.website.toLowerCase().trim();
  try {
    const tender = await prisma.tenderMerged.update({
      where: { id: params.tenderMergedId },
      data: { website },
      select: { id: true, organization: true, referenceNo: true },
    });

    if (!tender.organization) throw new Error("Tender has no organization");

    let mapping = await prisma.utilityMapping.findFirst({
      where: { organization: tender.organization, website },
    });

    const isNewMapping = !mapping;
    if (!mapping) {
      mapping = await prisma.utilityMapping.create({
        data: { organization: tender.organization, website },
      });
    }

    await prisma.tenderMerged.update({
      where: { id: params.tenderMergedId },
      data: { utilityMappingId: mapping.id },
    });

    if (isNewMapping) {
      logActivity({
        action: "CREATE",
        tableName: "UtilityMapping",
        recordId: String(mapping.id),
        referenceNo: tender.referenceNo ?? undefined,
        details: `Created utility mapping: "${tender.organization}" → "${website}"`,
      });
    }
    logActivity({
      action: "UPDATE",
      tableName: "TenderMerged",
      recordId: String(params.tenderMergedId),
      referenceNo: tender.referenceNo ?? undefined,
      details: `Updated website/utility mapping for tender #${params.tenderMergedId}: "${website}"`,
    });

    return { utilityMappingId: mapping.id, organization: tender.organization };
  } catch (error: any) {
    console.error(error);
    throw new Error(error.message ?? "Failed to update utility mapping");
  }
}

export const bulkAssignUtilityMappingAction = withLog(
  async (params: {
    organization: string;
    website: string;
    utilityMappingId: number;
    excludeTenderMergedId: number;
  }) => {
    await requireUserAction();
    const website = params.website.toLowerCase().trim();
    try {
      await prisma.tenderMerged.updateMany({
        where: {
          organization: params.organization,
          id: { not: params.excludeTenderMergedId },
          OR: [{ website: { not: website } }, { website: null }],
        },
        data: { website, utilityMappingId: params.utilityMappingId },
      });

      const updatedTenders = await prisma.tenderMerged.findMany({
        where: { organization: params.organization, website },
        select: { id: true },
      });

      const updatedIds = updatedTenders.map((t) => t.id);
      return { updatedIds };
    } catch (error: any) {
      console.error(error);
      throw new Error(error.message ?? "Failed to bulk assign utility mapping");
    }
  },
  (result, params) => {
    const website = params.website.toLowerCase().trim();
    return {
      action: "UPDATE" as const,
      tableName: "UtilityMapping",
      details: `Bulk assigned website "${website}" to organization "${params.organization}": ${result.updatedIds.length} tenders`,
    };
  },
);

export const updateTenderDecision = withLog(
  async (params: {
    tenderMergedId: number;
    field: "app" | "aps" | "apm" | "participated" | "catalogueDone";
    value: "YES" | "NO" | "NOT_DECIDED" | "true" | "false";
  }) => {
    await requireUserAction();
    let data: Record<string, unknown>;
    if (params.field === "participated") {
      data = {
        participated:
          params.value === "true"
            ? true
            : params.value === "false"
              ? false
              : null,
      };
    } else {
      data = { [params.field]: params.value };
    }

    await prisma.tenderMerged.update({
      where: { id: params.tenderMergedId },
      data,
    });

    if (params.field === "apm" && params.value === "YES") {
      const tender = await prisma.tenderMerged.findUnique({
        where: { id: params.tenderMergedId },
        include: { tenderAssociations: { include: { association: true } }, tenderFiles:true },
      });
      if (tender && tender.tenderAssociations.length > 0) {
        const {
          referenceNo,
          itemCategory,
          organization,
          deadline,
        } = tender;
        const webhookResponse = await sendTenderWebhook(
          { referenceNo, itemCategory, organization, deadline, tenderFileUrl:
          tender.tenderFiles.find((t) =>
            t.tags.includes(TENDER_FILE_TYPES.TENDER_DOCUMENT),
          )?.url ?? "", },
          tender.tenderType === "GEM" ? "Gem" : "Non-Gem",
          tender.tenderAssociations,
        );
        return { webhookTriggered: true, webhookResponse, referenceNo };
      }
    }

    return { webhookTriggered: false };
  },
  (_result, params) => ({
    action: "UPDATE" as const,
    tableName: "TenderMerged",
    recordId: String(params.tenderMergedId),
    details: `Updated ${params.field} to "${params.value}" on tender #${params.tenderMergedId}`,
  }),
);

export const updateDocketNumber = withLog(
  async (params: { tenderMergedId: number; docketNo: string }) => {
    await requireUserAction();
    console.log(`[action:updateDocketNumber] called with:`, params);
    const docketNo = params.docketNo.trim();

    if (docketNo) {
      if (!/^ENQ-\d+-(?:(\d{4})-\1|\d{2}-\d{2})$/i.test(docketNo)) {
        throw new Error(
          'Docket No must match format ENQ-{number}-{year}-{year} (e.g., ENQ-12345-2025-2026 or ENQ-12345-2026-2026).',
        );
      }
    }

    try {
      const updated = await prisma.tenderMerged.update({
        where: { id: params.tenderMergedId },
        data: { docketNo },
        select: { id: true, referenceNo: true },
      });
      console.log(
        `[action:updateDocketNumber] success for id=${params.tenderMergedId}`,
      );
      return updated;
    } catch (error: any) {
      console.error(
        `[action:updateDocketNumber] ERROR for id=${params.tenderMergedId}:`,
        error,
      );
      throw new Error(error.message ?? "Failed to update docket number");
    }
  },
  (updated, params) => ({
    action: "UPDATE" as const,
    tableName: "TenderMerged",
    recordId: String(updated.id),
    referenceNo: updated.referenceNo ?? undefined,
    details: `Updated docketNo to "${params.docketNo}" on tender #${params.tenderMergedId}`,
  }),
);

export const updateRemarks = withLog(
  async (params: { tenderMergedId: number; remarks: string }) => {
    await requireUserAction();
    console.log(`[action:updateRemarks] called with:`, params);
    try {
      const updated = await prisma.tenderMerged.update({
        where: { id: params.tenderMergedId },
        data: { remarks: params.remarks },
        select: { id: true, referenceNo: true },
      });
      console.log(
        `[action:updateRemarks] success for id=${params.tenderMergedId}`,
      );
      return updated;
    } catch (error: any) {
      console.error(
        `[action:updateRemarks] ERROR for id=${params.tenderMergedId}:`,
        error,
      );
      throw new Error(error.message ?? "Failed to update remarks");
    }
  },
  (updated, params) => ({
    action: "UPDATE" as const,
    tableName: "TenderMerged",
    recordId: String(updated.id),
    referenceNo: updated.referenceNo ?? undefined,
    details: `Updated remarks to "${params.remarks}" on tender #${params.tenderMergedId}`,
  }),
);

export const updateReason = withLog(
  async (params: { tenderMergedId: number; reason: string }) => {
    await requireUserAction();
    console.log(`[action:updateReason] called with:`, params);
    try {
      const updated = await prisma.tenderMerged.update({
        where: { id: params.tenderMergedId },
        data: { reason: params.reason },
        select: { id: true, referenceNo: true },
      });
      console.log(
        `[action:updateReason] success for id=${params.tenderMergedId}`,
      );
      return updated;
    } catch (error: any) {
      console.error(
        `[action:updateReason] ERROR for id=${params.tenderMergedId}:`,
        error,
      );
      throw new Error(error.message ?? "Failed to update reason");
    }
  },
  (updated, params) => ({
    action: "UPDATE" as const,
    tableName: "TenderMerged",
    recordId: String(updated.id),
    referenceNo: updated.referenceNo ?? undefined,
    details: `Updated reason to "${params.reason}" on tender #${params.tenderMergedId}`,
  }),
);

export async function updateBeneficiaryBankDetails(params: {
  tenderMergedId: number;
  beneficiaryBankDetails: string;
}) {
  await requireUserAction();
  await prisma.tenderMerged.update({
    where: { id: params.tenderMergedId },
    data: { beneficiaryBankDetails: params.beneficiaryBankDetails },
  });
  logActivity({
    action: "UPDATE",
    tableName: "TenderMerged",
    recordId: String(params.tenderMergedId),
    details: `Updated beneficiary bank details to "${params.beneficiaryBankDetails}" on tender #${params.tenderMergedId}`,
  });
}

export async function updateTenderMergedStringField(params: {
  tenderMergedId: number;
  field: string;
  value: string;
}): Promise<{ ok: boolean; error?: string; diffPercentFromL1?: number | null; diffPercentFromL2?: number | null; differenceBetweenRank1?: string | null; differenceBetweenRank2?: string | null }> {
  await requireUserAction();
  const { tenderMergedId, field } = params;
  let { value } = params;

  // Value and EMD are stored as plain rupees, the same as an uploaded sheet.
  if ((field === "value" || field === "emd") && value.trim() !== "") {
    const amount = field === "emd" ? parseEmd(value) : parseRupees(value);
    if (amount === null) {
      return { ok: false, error: `"${value.trim()}" is not an amount. Use a number, e.g. 1234567, 12.5 L or 1.5 Cr.` };
    }
    value = String(amount);
  }

  if (
    field === "emdPaymentMode" &&
    value &&
    value.trim() !== "" &&
    value !== "NO"
  ) {
    const current = await prisma.tenderMerged.findUnique({
      where: { id: tenderMergedId },
      select: {
        emdPaymentMode: true,
        referenceNo: true,
        deadline: true,
        documentFees: true,
        emd: true,
        docketNo: true,
        tenderBrief: true,
        tenderOpeningDate: true,
        remarks: true,
        beneficiaryBankDetails: true,
        organization: true,
        itemCategory: true,
        CostingSheetDetails: {
          select: {
            itemSchedule: true,
            proposedErpItemName: true,
            proposedErpQuantity: true,
          },
        },
        tenderFiles: {
          select: {
            name: true,
            extension: true,
            url: true,
            source: true,
            tags: true,
          },
        },
        tenderAssociations: {
          include: { association: true },
        },
      },
    });

    if (!current) return { ok: true };

    if (current.emdPaymentMode === value) return { ok: true };

    // const missing = validateEmdPayloadData(current);
    // if (missing.length > 0) {
    //   return {
    //     ok: false,
    //     error: `Cannot update EMD Payment Mode. Please fill in the following fields first: ${missing.join(", ")}`,
    //   };
    // }

    await prisma.tenderMerged.update({
      where: { id: tenderMergedId },
      data: { emdPaymentMode: value },
    });

    logActivity({
      action: "UPDATE",
      tableName: "TenderMerged",
      recordId: String(tenderMergedId),
      referenceNo: current.referenceNo ?? undefined,
      details: `Updated emdPaymentMode to "${value}" on tender #${tenderMergedId}`,
    });

    try {
      const itemList = (current.CostingSheetDetails ?? [])
        .filter((c) => c.proposedErpItemName && c.proposedErpItemName.trim() !== "")
        .map((c, index) => ({
          sl: index + 1,
          name: c.proposedErpItemName,
          qty: c.proposedErpQuantity ?? null,
          unit: null,
        }));

      const tenderDocument = current.tenderFiles.find((f) =>
        f.tags.includes(TENDER_FILE_TYPES.TENDER_DOCUMENT),
      );

      const attachments: EmdWebhookAttachment[] = [];
      if (tenderDocument) {
        const resolved = await resolveEmdAttachment(tenderDocument);
        if (resolved) attachments.push(resolved);
      }

      const associationName =
        current.tenderAssociations?.[0]?.association?.name?.trim() ?? "";

      const fileUrls = (current.tenderFiles ?? [])
        .filter((f) => f.tags.includes(TENDER_FILE_TYPES.TENDER_DOCUMENT))
        .map((f) => describeTenderFile(f).decrypted_fileId || f.url)
        .filter(Boolean) as string[];

      await triggerEmdPaymentWebhook(
        {
          tenderEnquiryNo: current.docketNo ?? "",
          tenderReferenceNo: current.referenceNo ?? "",
          clientName: current.organization ?? null,
          itemDescription: [current.tenderBrief, current.itemCategory].filter(Boolean).join(" @ "),
          itemList,
          bidSubmissionEndDate: current.deadline
            ? (toISTDateKey(current.deadline) ?? format(current.deadline, "yyyy-MM-dd"))
            : null,
          tenderFeeLastDate: null,
          tenderFee: null,
          bank: { bankName: current.beneficiaryBankDetails ?? null },
          emdAmount: current.emd ?? null,
          bgValidityDays: null,
          bgInstructions: "In the form of BG / Online NEFT / RTGS transfer only.",
          hardCopySubmissionDate: null,
          remarks: null,
          hasAttachments: !!tenderDocument,
          senderName: associationName,
          senderDesignation: null,
          companyName: null,
          fileUrls,
        },
        attachments,
      );
    } catch (error) {
      console.error("[EMD Webhook] Failed to trigger webhook:", error);
    }

    return { ok: true };
  }

  if (field === "raQualificationRule") {
    await prisma.tenderMerged.update({
      where: { id: tenderMergedId },
      data: {
        raQualificationRule: value,
        reverseAuctionApplicable: value ? true : null,
      },
    });

    logActivity({
      action: "UPDATE",
      tableName: "TenderMerged",
      recordId: String(tenderMergedId),
      details: `Updated raQualificationRule to "${value}" and reverseAuctionApplicable to "${!!value}" on tender #${tenderMergedId}`,
    });

    return { ok: true };
  }

  if (field === "bgStatus" || field === "currentStatus") {
    const current = await prisma.tenderMerged.findUnique({
      where: { id: tenderMergedId },
      select: { bgStatus: true, currentStatus: true },
    });

    const bgStatus = field === "bgStatus" ? value : (current?.bgStatus ?? "");
    const currentStatus =
      field === "currentStatus" ? value : (current?.currentStatus ?? "");
    const tenderUpdateStatus =
      bgStatus === "RETURNED" || currentStatus === "AWARDED"
        ? "CLOSED"
        : "OPEN";

    await prisma.tenderMerged.update({
      where: { id: tenderMergedId },
      data: { [field]: value, tenderUpdateStatus: tenderUpdateStatus as any },
    });

    logActivity({
      action: "UPDATE",
      tableName: "TenderMerged",
      recordId: String(tenderMergedId),
      details: `Updated ${field} to "${value}" and tenderUpdateStatus to "${tenderUpdateStatus}" on tender #${tenderMergedId}`,
    });

    return { ok: true };
  }

  await prisma.tenderMerged.update({
    where: { id: tenderMergedId },
    data: { [field]: value },
  });

  logActivity({
    action: "UPDATE",
    tableName: "TenderMerged",
    recordId: String(tenderMergedId),
    details: `Updated ${field} to "${value}" on tender #${tenderMergedId}`,
  });

  // Auto-calc Diff L1/L2 when Our Value or L price changes — same thunk/DB write
  const DIFF_TRIGGERS = new Set(["ourValue", "valueOfRank1", "valueOfRank2"]);
  if (DIFF_TRIGGERS.has(field)) {
    const rec = await prisma.tenderMerged.findUnique({
      where: { id: tenderMergedId },
      select: { ourValue: true, valueOfRank1: true, valueOfRank2: true, referenceNo: true },
    });
    if (rec) {
      const effectiveOur = field === "ourValue" ? value : rec.ourValue;
      const effectiveL1 = field === "valueOfRank1" ? value : rec.valueOfRank1;
      const effectiveL2 = field === "valueOfRank2" ? value : rec.valueOfRank2;

      const shouldCalcL1 = field === "ourValue" || field === "valueOfRank1";
      const shouldCalcL2 = field === "ourValue" || field === "valueOfRank2";

      const diffData: Record<string, number | string | null> = {};
      let d1: number | null | undefined;
      let d2: number | null | undefined;
      let s1: string | null | undefined;
      let s2: string | null | undefined;

      if (shouldCalcL1) {
        d1 = calcDiffDecimal(effectiveOur, effectiveL1);
        s1 = calcDiffString(effectiveOur, effectiveL1);
        diffData.diffPercentFromL1 = d1;
        diffData.differenceBetweenRank1 = s1;
      }
      if (shouldCalcL2) {
        d2 = calcDiffDecimal(effectiveOur, effectiveL2);
        s2 = calcDiffString(effectiveOur, effectiveL2);
        diffData.diffPercentFromL2 = d2;
        diffData.differenceBetweenRank2 = s2;
      }

      if (Object.keys(diffData).length > 0) {
        await prisma.tenderMerged.update({
          where: { id: tenderMergedId },
          data: diffData,
        });
        logActivity({
          action: "UPDATE",
          tableName: "TenderMerged",
          recordId: String(tenderMergedId),
          referenceNo: rec.referenceNo ?? undefined,
          details: `Auto-calc diff triggered by ${field}: L1=${d1 ?? "null"} (${s1 ?? "null"}), L2=${d2 ?? "null"} (${s2 ?? "null"})`,
        });
        return {
          ok: true,
          diffPercentFromL1: d1 as number | null,
          diffPercentFromL2: d2 as number | null,
          differenceBetweenRank1: s1 as string | null,
          differenceBetweenRank2: s2 as string | null,
        };
      }
    }
  }

  return { ok: true };
}

export async function updateTenderMergedDateField(params: {
  tenderMergedId: number;
  field: string;
  value: string | null;
}) {
  await requireUserAction();
  await prisma.tenderMerged.update({
    where: { id: params.tenderMergedId },
    data: { [params.field]: params.value ? parseDate(params.value) : null },
  });
  logActivity({
    action: "UPDATE",
    tableName: "TenderMerged",
    recordId: String(params.tenderMergedId),
    details: `Updated ${params.field} to "${params.value}" on tender #${params.tenderMergedId}`,
  });
}

export async function updateTenderMergedBooleanField(params: {
  tenderMergedId: number;
  field: string;
  value: boolean;
}) {
  await requireUserAction();
  await prisma.tenderMerged.update({
    where: { id: params.tenderMergedId },
    data: { [params.field]: params.value },
  });
  logActivity({
    action: "UPDATE",
    tableName: "TenderMerged",
    recordId: String(params.tenderMergedId),
    details: `Updated ${params.field} to "${params.value}" on tender #${params.tenderMergedId}`,
  });
}

export const updateStatusAndAction = withLog(
  async (params: {
    tenderMergedId: number;
    tenderUpdateStatus: string;
    nextAction: string | null;
    reverseAuctionApplicable: boolean | null;
  }) => {
    await requireUserAction();
    console.log(`[action:updateTenderStatusAndAction] called with:`, params);
    try {
      const updated = await prisma.tenderMerged.update({
        where: { id: params.tenderMergedId },
        data: {
          tenderUpdateStatus: params.tenderUpdateStatus as any,
          nextAction: params.nextAction as any,
          reverseAuctionApplicable: params.reverseAuctionApplicable,
        },
        select: { id: true, referenceNo: true },
      });
      console.log(
        `[action:updateTenderStatusAndAction] success for id=${params.tenderMergedId}`,
      );
      return updated;
    } catch (error: any) {
      console.error(
        `[action:updateTenderStatusAndAction] ERROR for id=${params.tenderMergedId}:`,
        error,
      );
      throw new Error(
        error.message ?? "Failed to update tender status and action",
      );
    }
  },
  (updated, params) => ({
    action: "UPDATE" as const,
    tableName: "TenderMerged",
    recordId: String(updated.id),
    referenceNo: updated.referenceNo ?? undefined,
    details: `Updated tenderUpdateStatus="${params.tenderUpdateStatus}" nextAction="${params.nextAction}" reverseAuctionApplicable="${params.reverseAuctionApplicable}" on tender #${params.tenderMergedId}`,
  }),
);

const REASON_FOR_NOT_APM_OPTIONS = [
  "Not Enlisted",
  "BIS Issue",
  "Special Certification Required",
  "Poor Payment Terms",
  "Quantity Restrain",
] as const;

export const updateReasonForNotAPM = withLog(
  async (params: { tenderMergedId: number; reasonForNotAPM: string }) => {
    await requireUserAction();
    const raw = (params.reasonForNotAPM ?? "").trim();
    if (raw !== "" && !(REASON_FOR_NOT_APM_OPTIONS as readonly string[]).includes(raw)) {
      throw new Error(`Invalid reasonForNotAPM value: "${raw}"`);
    }
    const updated = await prisma.tenderMerged.update({
      where: { id: params.tenderMergedId },
      data: { reasonForNotAPM: raw || null },
      select: { id: true, referenceNo: true },
    });
    return updated;
  },
  (updated, params) => ({
    action: "UPDATE" as const,
    tableName: "TenderMerged",
    recordId: String(updated.id),
    referenceNo: updated.referenceNo ?? undefined,
    details: `Updated reasonForNotAPM to "${params.reasonForNotAPM}" on tender #${params.tenderMergedId}`,
  }),
);

export const triggerReverseAuctionMail = withLog(
  async (params: ReverseAuctionWebhookData) => {
    await requireUserAction();
    console.log(
      `[action:triggerReverseAuctionMail] called for tender #${params.tenderMergedId}`,
    );
    await triggerReverseAuctionWebhook(params);
    return { ok: true };
  },
  (result, params) => ({
    action: "UPDATE" as const,
    tableName: "TenderMerged",
    recordId: String(params.tenderMergedId),
    referenceNo: params.referenceNo ?? undefined,
    details: `Reverse auction email webhook evaluated for tender #${params.tenderMergedId}`,
  }),
);
