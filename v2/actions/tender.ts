"use server";

import { prisma } from "@/lib/prisma";
import { sendTenderWebhook } from "@/lib/webhook";
import { logActivity } from "@/lib/activity-logger";

export async function updateTenderAssignmentsAction(params: {
  gemTenderId?: number;
  nonGemTenderId?: number;
  associationIds: number[];
}) {
  if (params.gemTenderId) {
    await prisma.tenderAssociation.deleteMany({ where: { gemTenderId: params.gemTenderId } });
    if (params.associationIds.length > 0) {
      await prisma.tenderAssociation.createMany({
        data: params.associationIds.map((associationId) => ({ gemTenderId: params.gemTenderId!, associationId })),
      });
    }
    const gemTender = await prisma.gemTender.findUnique({
      where: { id: params.gemTenderId },
      include: { tenderAssociations: { include: { association: true } } },
    });
    if (gemTender && gemTender.apm === "YES" && gemTender.tenderAssociations.length > 0) {
      const { referenceNo, itemCategory, organization, deadline, tenderFileUrl } = gemTender as any;
      sendTenderWebhook({ referenceNo, itemCategory, organization, deadline, tenderFileUrl }, "Gem", gemTender.tenderAssociations);
    }
    logActivity({
      action: "UPDATE",
      tableName: "TenderAssociation",
      recordId: String(params.gemTenderId),
      referenceNo: gemTender?.referenceNo ?? undefined,
      details: `Updated assignees for Gem tender #${params.gemTenderId}: ${params.associationIds.length} association(s)`,
    });
  } else if (params.nonGemTenderId) {
    await prisma.tenderAssociation.deleteMany({ where: { nonGemTenderId: params.nonGemTenderId } });
    if (params.associationIds.length > 0) {
      await prisma.tenderAssociation.createMany({
        data: params.associationIds.map((associationId) => ({ nonGemTenderId: params.nonGemTenderId!, associationId })),
      });
    }
    const nonGemTender = await prisma.nonGemTender.findUnique({
      where: { id: params.nonGemTenderId },
      include: { tenderAssociations: { include: { association: true } } },
    });
    if (nonGemTender && nonGemTender.apm === "YES" && nonGemTender.tenderAssociations.length > 0) {
      const { referenceNo, itemCategory, organization, deadline, tenderFileUrl } = nonGemTender as any;
      sendTenderWebhook({ referenceNo, itemCategory, organization, deadline, tenderFileUrl }, "Non-Gem", nonGemTender.tenderAssociations);
    }
    logActivity({
      action: "UPDATE",
      tableName: "TenderAssociation",
      recordId: String(params.nonGemTenderId),
      referenceNo: nonGemTender?.referenceNo ?? undefined,
      details: `Updated assignees for Non-Gem tender #${params.nonGemTenderId}: ${params.associationIds.length} association(s)`,
    });
  }
}

export async function updateTenderUtilityMapping(params: {
  id: number;
  type: "Gem" | "Non-Gem";
  website: string;
}) {
  const website = params.website.toLowerCase().trim();
  try {
    let organization: string | null = null;

    let referenceNo: string | null = null;
    if (params.type === "Gem") {
      const tender = await prisma.gemTender.update({
        where: { id: params.id },
        data: { website },
        select: { id: true, organization: true, referenceNo: true },
      });
      organization = tender.organization;
      referenceNo = tender.referenceNo;
    } else {
      const tender = await prisma.nonGemTender.update({
        where: { id: params.id },
        data: { website },
        select: { id: true, organization: true, referenceNo: true },
      });
      organization = tender.organization;
      referenceNo = tender.referenceNo;
    }

    if (!organization) throw new Error("Tender has no organization");

    let mapping = await prisma.utilityMapping.findFirst({
      where: { organization, website },
    });

    const isNewMapping = !mapping;
    if (!mapping) {
      mapping = await prisma.utilityMapping.create({
        data: { organization, website },
      });
    }

    if (params.type === "Gem") {
      await prisma.gemTender.update({
        where: { id: params.id },
        data: { utilityMappingId: mapping.id },
      });
    } else {
      await prisma.nonGemTender.update({
        where: { id: params.id },
        data: { utilityMappingId: mapping.id },
      });
    }

    if (isNewMapping) {
      logActivity({
        action: "CREATE",
        tableName: "UtilityMapping",
        recordId: String(mapping.id),
        details: `Created utility mapping: "${organization}" → "${website}"`,
      });
    }
    logActivity({
      action: "UPDATE",
      tableName: params.type === "Gem" ? "GemTender" : "NonGemTender",
      recordId: String(params.id),
      referenceNo: referenceNo ?? undefined,
      details: `Updated website/utility mapping for ${params.type} tender #${params.id}: "${website}"`,
    });

    return { utilityMappingId: mapping.id, organization };
  } catch (error: any) {
    console.error(error);
    throw new Error(error.message ?? "Failed to update utility mapping");
  }
}

export async function bulkAssignUtilityMappingAction(params: {
  organization: string;
  website: string;
  utilityMappingId: number;
  excludeTenderId: number;
  excludeTenderType: "Gem" | "Non-Gem";
}) {
  const website = params.website.toLowerCase().trim();
  try {
    const [gemResult, nonGemResult] = await Promise.all([
      prisma.gemTender.updateMany({
        where: {
          organization: params.organization,
          id: { not: params.excludeTenderType === "Gem" ? params.excludeTenderId : undefined },
          OR: [
            { website: { not: website } },
            { website: null },
          ],
        },
        data: { website, utilityMappingId: params.utilityMappingId },
      }),
      prisma.nonGemTender.updateMany({
        where: {
          organization: params.organization,
          id: { not: params.excludeTenderType === "Non-Gem" ? params.excludeTenderId : undefined },
          OR: [
            { website: { not: website } },
            { website: null },
          ],
        },
        data: { website, utilityMappingId: params.utilityMappingId },
      }),
    ]);

    const [gemIds, nonGemIds] = await Promise.all([
      prisma.gemTender.findMany({
        where: { organization: params.organization, website },
        select: { id: true },
      }),
      prisma.nonGemTender.findMany({
        where: { organization: params.organization, website },
        select: { id: true },
      }),
    ]);

    const gemIdsArr = gemIds.map((g) => g.id);
    const nonGemIdsArr = nonGemIds.map((g) => g.id);
    logActivity({
      action: "UPDATE",
      tableName: "UtilityMapping",
      details: `Bulk assigned website "${website}" to organization "${params.organization}": ${gemIdsArr.length} Gem + ${nonGemIdsArr.length} Non-Gem tenders`,
    });
    return {
      updatedGem: gemIdsArr,
      updatedNonGem: nonGemIdsArr,
    };
  } catch (error: any) {
    console.error(error);
    throw new Error(error.message ?? "Failed to bulk assign utility mapping");
  }
}

export async function updateTenderDecision(params: {
  id: number;
  type: "Gem" | "Non-Gem";
  field: "app" | "aps" | "apm";
  value: "YES" | "NO" | "NOT_DECIDED";
}) {
  const data = { [params.field]: params.value };
  let webhookTriggered = false;
  try {
    console.log(data);
    if (params.type === "Gem") {
      await prisma.gemTender.update({ where: { id: params.id }, data });
      if (params.field === "apm" && params.value === "YES") {
        const tender = await prisma.gemTender.findUnique({
          where: { id: params.id },
          include: { tenderAssociations: { include: { association: true } } },
        });
        if (tender && tender.tenderAssociations.length > 0) {
          const { referenceNo, itemCategory, organization, deadline, tenderFileUrl } = tender as any;
          const webhookResponse = await sendTenderWebhook({ referenceNo, itemCategory, organization, deadline, tenderFileUrl }, "Gem", tender.tenderAssociations);
          return { webhookTriggered: true, webhookResponse, referenceNo };
        }
      }
    } else {
      await prisma.nonGemTender.update({ where: { id: params.id }, data });
      if (params.field === "apm" && params.value === "YES") {
        const tender = await prisma.nonGemTender.findUnique({
          where: { id: params.id },
          include: { tenderAssociations: { include: { association: true } } },
        });
        if (tender && tender.tenderAssociations.length > 0) {
          const { referenceNo, itemCategory, organization, deadline, tenderFileUrl } = tender as any;
          const webhookResponse = await sendTenderWebhook({ referenceNo, itemCategory, organization, deadline, tenderFileUrl }, "Non-Gem", tender.tenderAssociations);
          return { webhookTriggered: true, webhookResponse, referenceNo };
        }
      }
    }
    const referenceNo = params.type === "Gem"
      ? (await prisma.gemTender.findUnique({ where: { id: params.id }, select: { referenceNo: true } }))?.referenceNo
      : (await prisma.nonGemTender.findUnique({ where: { id: params.id }, select: { referenceNo: true } }))?.referenceNo;
    logActivity({
      action: "UPDATE",
      tableName: params.type === "Gem" ? "GemTender" : "NonGemTender",
      recordId: String(params.id),
      referenceNo: referenceNo ?? undefined,
      details: `Updated ${params.field} to "${params.value}" on ${params.type} tender #${params.id}`,
    });
  } catch (error: any) {
    console.error(error);
  }
  return { webhookTriggered: false };
}
