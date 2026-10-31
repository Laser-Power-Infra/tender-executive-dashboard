"use server";

import { withLog } from "@/lib/activity-logger";
import { requireDeveloperAction, requireUserAction } from "@/lib/dal";
import { prisma } from "@/lib/prisma";

// A request hides the tender (deleteRequestedAt set); only a developer deletes the row for good.
const CLEAR_REQUEST = { deleteRequestedAt: null, deleteRequestedById: null, deleteReason: null } as const;

export const requestTenderDelete = withLog(
  async (params: { tenderMergedId: number; reason: string }) => {
    const user = await requireUserAction();
    const reason = params.reason.trim();
    if (!reason) throw new Error("Give a reason for the delete");
    const tender = await prisma.tenderMerged.findUnique({
      where: { id: params.tenderMergedId },
      select: { id: true, referenceNo: true, deleteRequestedAt: true },
    });
    if (!tender) throw new Error("Tender not found");
    if (tender.deleteRequestedAt) throw new Error("Delete is already requested for this tender");
    await prisma.tenderMerged.update({
      where: { id: tender.id },
      data: { deleteRequestedAt: new Date(), deleteRequestedById: user.id, deleteReason: reason },
    });
    return { id: tender.id, referenceNo: tender.referenceNo, reason };
  },
  (r) => ({
    action: "UPDATE" as const,
    tableName: "TenderMerged",
    recordId: String(r.id),
    referenceNo: r.referenceNo,
    details: `Requested delete of ${r.referenceNo}: ${r.reason}`,
  }),
);

export const listDeleteRequests = withLog(
  async () => {
    await requireDeveloperAction();
    const rows = await prisma.tenderMerged.findMany({
      where: { deleteRequestedAt: { not: null } },
      select: {
        id: true,
        referenceNo: true,
        docketNo: true,
        organization: true,
        tenderBrief: true,
        deleteRequestedAt: true,
        deleteRequestedById: true,
        deleteReason: true,
      },
      orderBy: { deleteRequestedAt: "asc" },
    });
    const ids = [...new Set(rows.map((r) => r.deleteRequestedById).filter((id): id is string => !!id))];
    const users = await prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, email: true },
    });
    const byId = new Map(users.map((u) => [u.id, u.name || u.email]));
    return rows.map((r) => ({
      id: r.id,
      referenceNo: r.referenceNo,
      docketNo: r.docketNo,
      organization: r.organization,
      tenderBrief: r.tenderBrief,
      reason: r.deleteReason,
      requestedAt: r.deleteRequestedAt,
      requestedBy: (r.deleteRequestedById && byId.get(r.deleteRequestedById)) || null,
    }));
  },
  () => null,
);

export const rejectTenderDelete = withLog(
  async (id: number) => {
    await requireDeveloperAction();
    const { count } = await prisma.tenderMerged.updateMany({
      where: { id, deleteRequestedAt: { not: null } },
      data: CLEAR_REQUEST,
    });
    if (!count) throw new Error("No delete request for this tender");
    return { id };
  },
  (r) => ({
    action: "UPDATE" as const,
    tableName: "TenderMerged",
    recordId: String(r.id),
    details: `Rejected delete request for tender #${r.id}; tender restored`,
  }),
);

export const confirmTenderDelete = withLog(
  async (id: number) => {
    await requireDeveloperAction();
    const tender = await prisma.tenderMerged.findFirst({
      where: { id, deleteRequestedAt: { not: null } },
      select: { referenceNo: true },
    });
    if (!tender) throw new Error("No delete request for this tender");
    // Related rows (associations, reportings, evaluations, files, costing) go with it by DB cascade.
    await prisma.tenderMerged.delete({ where: { id } });
    return { id, referenceNo: tender.referenceNo };
  },
  (r) => ({
    action: "DELETE" as const,
    tableName: "TenderMerged",
    recordId: String(r.id),
    referenceNo: r.referenceNo,
    details: `Permanently deleted tender ${r.referenceNo}`,
  }),
);
