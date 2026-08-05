"use server";

import { prisma } from "@/lib/prisma";
import { sendTenderWebhook } from "@/lib/webhook";
import { withLog, logActivity } from "@/lib/activity-logger";
import {
  triggerEmdPaymentWebhook,
  EMD_VALID_VALUES,
} from "@/lib/integrations/n8n";
import { TENDER_FILE_TYPES } from "@/lib/tender-file-types";

export async function updateTenderAssignmentsAction(params: {
  tenderMergedId: number;
  associationIds: number[];
}) {
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
  if (tender && tender.apm === "YES" && tender.tenderAssociations.length > 0) {
    const { referenceNo, itemCategory, organization, deadline, tenderFileUrl } =
      tender;

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
  logActivity({
    action: "UPDATE",
    tableName: "TenderAssociation",
    recordId: String(params.tenderMergedId),
    referenceNo: tender?.referenceNo ?? undefined,
    details: `Updated assignees for tender #${params.tenderMergedId}: ${params.associationIds.length} association(s)`,
  });
}

export async function updateTenderUtilityMapping(params: {
  tenderMergedId: number;
  website: string;
}) {
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
    field: "app" | "aps" | "apm" | "participated";
    value: "YES" | "NO" | "NOT_DECIDED" | "true" | "false";
  }) => {
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
    console.log(`[action:updateDocketNumber] called with:`, params);
    try {
      const updated = await prisma.tenderMerged.update({
        where: { id: params.tenderMergedId },
        data: { docketNo: params.docketNo },
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

export const updateBgNoUtrNo = withLog(
  async (params: { tenderMergedId: number; bgNoUtrNo: string }) => {
    console.log(`[action:updateBgNoUtrNo] called with:`, params);
    try {
      const updated = await prisma.tenderMerged.update({
        where: { id: params.tenderMergedId },
        data: { bgNoUtrNo: params.bgNoUtrNo },
        select: { id: true, referenceNo: true },
      });
      console.log(
        `[action:updateBgNoUtrNo] success for id=${params.tenderMergedId}`,
      );
      return updated;
    } catch (error: any) {
      console.error(
        `[action:updateBgNoUtrNo] ERROR for id=${params.tenderMergedId}:`,
        error,
      );
      throw new Error(error.message ?? "Failed to update BG/UTR number");
    }
  },
  (updated, params) => ({
    action: "UPDATE" as const,
    tableName: "TenderMerged",
    recordId: String(updated.id),
    referenceNo: updated.referenceNo ?? undefined,
    details: `Updated bgNoUtrNo to "${params.bgNoUtrNo}" on tender #${params.tenderMergedId}`,
  }),
);

export const updateRemarks = withLog(
  async (params: { tenderMergedId: number; remarks: string }) => {
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

export const updateLoiPoNoAndDate = withLog(
  async (params: { tenderMergedId: number; loiPoNoAndDate: string }) => {
    console.log(`[action:updateLoiPoNoAndDate] called with:`, params);
    try {
      const updated = await prisma.tenderMerged.update({
        where: { id: params.tenderMergedId },
        data: { loiPoNoAndDate: params.loiPoNoAndDate },
        select: { id: true, referenceNo: true },
      });
      console.log(
        `[action:updateLoiPoNoAndDate] success for id=${params.tenderMergedId}`,
      );
      return updated;
    } catch (error: any) {
      console.error(
        `[action:updateLoiPoNoAndDate] ERROR for id=${params.tenderMergedId}:`,
        error,
      );
      throw new Error(error.message ?? "Failed to update LOI/PO No");
    }
  },
  (updated, params) => ({
    action: "UPDATE" as const,
    tableName: "TenderMerged",
    recordId: String(updated.id),
    referenceNo: updated.referenceNo ?? undefined,
    details: `Updated loiPoNoAndDate to "${params.loiPoNoAndDate}" on tender #${params.tenderMergedId}`,
  }),
);

export const updateCompetitors = withLog(
  async (params: { tenderMergedId: number; competitors: string }) => {
    console.log(`[action:updateCompetitors] called with:`, params);
    try {
      const updated = await prisma.tenderMerged.update({
        where: { id: params.tenderMergedId },
        data: { competitors: params.competitors },
        select: { id: true, referenceNo: true },
      });
      console.log(
        `[action:updateCompetitors] success for id=${params.tenderMergedId}`,
      );
      return updated;
    } catch (error: any) {
      console.error(
        `[action:updateCompetitors] ERROR for id=${params.tenderMergedId}:`,
        error,
      );
      throw new Error(error.message ?? "Failed to update competitors");
    }
  },
  (updated, params) => ({
    action: "UPDATE" as const,
    tableName: "TenderMerged",
    recordId: String(updated.id),
    referenceNo: updated.referenceNo ?? undefined,
    details: `Updated competitors to "${params.competitors}" on tender #${params.tenderMergedId}`,
  }),
);

export const updateDiffPercentFromL1 = withLog(
  async (params: {
    tenderMergedId: number;
    diffPercentFromL1: number | null;
  }) => {
    console.log(`[action:updateDiffPercentFromL1] called with:`, params);
    try {
      const updated = await prisma.tenderMerged.update({
        where: { id: params.tenderMergedId },
        data: { diffPercentFromL1: params.diffPercentFromL1 },
        select: { id: true, referenceNo: true },
      });
      console.log(
        `[action:updateDiffPercentFromL1] success for id=${params.tenderMergedId}`,
      );
      return updated;
    } catch (error: any) {
      console.error(
        `[action:updateDiffPercentFromL1] ERROR for id=${params.tenderMergedId}:`,
        error,
      );
      throw new Error(error.message ?? "Failed to update Diff L1");
    }
  },
  (updated, params) => ({
    action: "UPDATE" as const,
    tableName: "TenderMerged",
    recordId: String(updated.id),
    referenceNo: updated.referenceNo ?? undefined,
    details: `Updated diffPercentFromL1 to "${params.diffPercentFromL1}" on tender #${params.tenderMergedId}`,
  }),
);

export const updateDiffPercentFromL2 = withLog(
  async (params: {
    tenderMergedId: number;
    diffPercentFromL2: number | null;
  }) => {
    console.log(`[action:updateDiffPercentFromL2] called with:`, params);
    try {
      const updated = await prisma.tenderMerged.update({
        where: { id: params.tenderMergedId },
        data: { diffPercentFromL2: params.diffPercentFromL2 },
        select: { id: true, referenceNo: true },
      });
      console.log(
        `[action:updateDiffPercentFromL2] success for id=${params.tenderMergedId}`,
      );
      return updated;
    } catch (error: any) {
      console.error(
        `[action:updateDiffPercentFromL2] ERROR for id=${params.tenderMergedId}:`,
        error,
      );
      throw new Error(error.message ?? "Failed to update Diff L2");
    }
  },
  (updated, params) => ({
    action: "UPDATE" as const,
    tableName: "TenderMerged",
    recordId: String(updated.id),
    referenceNo: updated.referenceNo ?? undefined,
    details: `Updated diffPercentFromL2 to "${params.diffPercentFromL2}" on tender #${params.tenderMergedId}`,
  }),
);

export async function updateBeneficiaryBankDetails(params: {
  tenderMergedId: number;
  beneficiaryBankDetails: string;
}) {
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

type EmdPayloadSelect = {
  emdPaymentMode: string | null;
  referenceNo: string | null;
  proposedErpItemName: string | null;
  proposedErpQuantity: string | null;
  deadline: Date | null;
  documentFees: string | null;
  emd: string | null;
};

function validateEmdPayloadData(record: EmdPayloadSelect) {
  const missing: string[] = [];

  if (!record.referenceNo) missing.push("Reference No.");
  if (!record.proposedErpItemName) missing.push("Proposed ERP Item Name");
  if (!record.proposedErpQuantity || Number(record.proposedErpQuantity) <= 0)
    missing.push("Proposed ERP Quantity");
  if (!record.deadline) missing.push("Last Date of Submission");
  if (!record.documentFees || Number(record.documentFees) <= 0)
    missing.push("Document Fee");
  if (!record.emd || Number(record.emd) <= 0) missing.push("EMD Amount");

  return missing;
}

export async function updateTenderMergedStringField(params: {
  tenderMergedId: number;
  field: string;
  value: string;
}) {
  const { tenderMergedId, field, value } = params;

  if (
    field === "emdPaymentMode" &&
    value &&
    (EMD_VALID_VALUES as readonly string[]).includes(value)
  ) {
    const current = await prisma.tenderMerged.findUnique({
      where: { id: tenderMergedId },
      select: {
        emdPaymentMode: true,
        referenceNo: true,
        proposedErpItemName: true,
        proposedErpQuantity: true,
        deadline: true,
        documentFees: true,
        emd: true,
      },
    });

    if (!current) return;

    if (current.emdPaymentMode === value) return;

    const missing = validateEmdPayloadData(current);
    if (missing.length > 0) {
      throw new Error(
        `Cannot update EMD Payment Mode. Please fill in the following fields first: ${missing.join(", ")}`,
      );
    }

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
      await triggerEmdPaymentWebhook({
        referenceNo: current.referenceNo ?? "",
        proposedErpItemName: current.proposedErpItemName ?? "",
        proposedErpQuantity: current.proposedErpQuantity
          ? Number(current.proposedErpQuantity)
          : 0,
        lastDateOfSubmission: current.deadline?.toISOString() ?? "",
        documentFee: current.documentFees ? Number(current.documentFees) : 0,
        emdAmount: current.emd ? Number(current.emd) : 0,
        emdPaymentMode: value,
      });
    } catch (error) {
      console.error("[EMD Webhook] Failed to trigger webhook:", error);
    }

    return;
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

    return;
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

    return;
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
}

export async function updateTenderMergedDateField(params: {
  tenderMergedId: number;
  field: string;
  value: string | null;
}) {
  await prisma.tenderMerged.update({
    where: { id: params.tenderMergedId },
    data: { [params.field]: params.value ? new Date(params.value) : null },
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
