"use server";

import { prisma } from "@/lib/prisma";
import { sendTenderWebhook } from "@/lib/webhook";
import { logActivity } from "@/lib/activity-logger";

export async function updateTenderAssignmentsAction(params: {
  tenderMergedId: number;
  associationIds: number[];
}) {
  await prisma.tenderAssociation.deleteMany({ where: { tenderMergedId: params.tenderMergedId } });
  if (params.associationIds.length > 0) {
    await prisma.tenderAssociation.createMany({
      data: params.associationIds.map((associationId) => ({ tenderMergedId: params.tenderMergedId, associationId })),
    });
  }
  const tender = await prisma.tenderMerged.findUnique({
    where: { id: params.tenderMergedId },
    include: { tenderAssociations: { include: { association: true } } },
  });
  if (tender && tender.apm === "YES" && tender.tenderAssociations.length > 0) {
    const { referenceNo, itemCategory, organization, deadline, tenderFileUrl } = tender;
    sendTenderWebhook({ referenceNo, itemCategory, organization, deadline, tenderFileUrl }, tender.tenderType === "GEM" ? "Gem" : "Non-Gem", tender.tenderAssociations);
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

export async function bulkAssignUtilityMappingAction(params: {
  organization: string;
  website: string;
  utilityMappingId: number;
  excludeTenderMergedId: number;
}) {
  const website = params.website.toLowerCase().trim();
  try {
    const result = await prisma.tenderMerged.updateMany({
      where: {
        organization: params.organization,
        id: { not: params.excludeTenderMergedId },
        OR: [
          { website: { not: website } },
          { website: null },
        ],
      },
      data: { website, utilityMappingId: params.utilityMappingId },
    });

    const updatedTenders = await prisma.tenderMerged.findMany({
      where: { organization: params.organization, website },
      select: { id: true },
    });

    const updatedIds = updatedTenders.map((t) => t.id);
    logActivity({
      action: "UPDATE",
      tableName: "UtilityMapping",
      details: `Bulk assigned website "${website}" to organization "${params.organization}": ${updatedIds.length} tenders`,
    });
    return { updatedIds };
  } catch (error: any) {
    console.error(error);
    throw new Error(error.message ?? "Failed to bulk assign utility mapping");
  }
}

export async function updateTenderDecision(params: {
  tenderMergedId: number;
  field: "app" | "aps" | "apm";
  value: "YES" | "NO" | "NOT_DECIDED";
}) {
  const data = { [params.field]: params.value };
  try {
    await prisma.tenderMerged.update({ where: { id: params.tenderMergedId }, data });
    if (params.field === "apm" && params.value === "YES") {
      const tender = await prisma.tenderMerged.findUnique({
        where: { id: params.tenderMergedId },
        include: { tenderAssociations: { include: { association: true } } },
      });
      if (tender && tender.tenderAssociations.length > 0) {
        const { referenceNo, itemCategory, organization, deadline, tenderFileUrl } = tender;
        const webhookResponse = await sendTenderWebhook({ referenceNo, itemCategory, organization, deadline, tenderFileUrl }, tender.tenderType === "GEM" ? "Gem" : "Non-Gem", tender.tenderAssociations);
        return { webhookTriggered: true, webhookResponse, referenceNo };
      }
    }
    const tender = await prisma.tenderMerged.findUnique({ where: { id: params.tenderMergedId }, select: { referenceNo: true } });
    logActivity({
      action: "UPDATE",
      tableName: "TenderMerged",
      recordId: String(params.tenderMergedId),
      referenceNo: tender?.referenceNo ?? undefined,
      details: `Updated ${params.field} to "${params.value}" on tender #${params.tenderMergedId}`,
    });
  } catch (error: any) {
    console.error(error);
  }
  return { webhookTriggered: false };
}
