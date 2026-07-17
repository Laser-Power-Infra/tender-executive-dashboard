"use server";

import { prisma } from "@/lib/prisma";
import { sendTenderWebhook } from "@/lib/webhook";

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

    if (params.type === "Gem") {
      const tender = await prisma.gemTender.update({
        where: { id: params.id },
        data: { website },
        select: { id: true, organization: true },
      });
      organization = tender.organization;
    } else {
      const tender = await prisma.nonGemTender.update({
        where: { id: params.id },
        data: { website },
        select: { id: true, organization: true },
      });
      organization = tender.organization;
    }

    if (!organization) throw new Error("Tender has no organization");

    let mapping = await prisma.utilityMapping.findFirst({
      where: { organization, website },
    });

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

    return {
      updatedGem: gemIds.map((g) => g.id),
      updatedNonGem: nonGemIds.map((g) => g.id),
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
  } catch (error: any) {
    console.error(error);
  }
  return { webhookTriggered: false };
}
