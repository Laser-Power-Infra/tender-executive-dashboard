import "server-only";
import { prisma } from "@/lib/prisma";
import { formatDateISTLong } from "@/lib/format-ist";
import { publishWhatsAppNotification } from "@/lib/queue/publisher";
import type { Prisma } from "@/generated/prisma/client";

// Tenders whose deadline passed before WhatsApp went live are never notified, so the first run sends no backlog.
const DEADLINE_START = new Date("2026-11-22T00:00:00+05:30");
const DAY_MS = 24 * 60 * 60 * 1000;

const TENDER_SELECT = {
  id: true,
  referenceNo: true,
  tenderBrief: true,
  organization: true,
  deadline: true,
  reason: true,
  notificationStatus: true,
  tenderAssociations: { select: { association: { select: { email: true } } } },
} as const;

type Tender = Prisma.TenderMergedGetPayload<{ select: typeof TENDER_SELECT }>;

const header = (title: string, t: Tender, deadlineSuffix = "") =>
  [
    `*${title}*`,
    "",
    `Tender No: ${t.referenceNo}`,
    `Tender: ${t.tenderBrief ?? "-"}`,
    `Organization: ${t.organization ?? "-"}`,
    `Deadline: ${formatDateISTLong(t.deadline)}${deadlineSuffix}`,
  ].join("\n");

const daysLeft = (deadline: Date | null, now: Date) =>
  Math.max(1, Math.ceil(((deadline?.getTime() ?? now.getTime()) - now.getTime()) / DAY_MS));

/** Each type: which tenders get it and what they say. The key is recorded in TenderMerged.notificationStatus once sent. */
const TYPES = [
  {
    key: "deadline_over_not_participated_notification",
    where: (now: Date): Prisma.TenderMergedWhereInput => ({
      deadline: { gt: DEADLINE_START, lte: now },
      participated: false,
      AND: [{ reason: { not: null } }, { NOT: { reason: "" } }],
    }),
    message: (t: Tender) => `${header("Deadline Over - Not Participated", t)}\n\nReason: ${t.reason}`,
  },
  {
    key: "deadline_over_reason_not_provided_notification",
    where: (now: Date): Prisma.TenderMergedWhereInput => ({
      deadline: { gt: DEADLINE_START, lte: now },
      AND: [
        { OR: [{ participated: false }, { participated: null }] },
        { OR: [{ reason: null }, { reason: "" }] },
      ],
    }),
    message: (t: Tender) =>
      `${header("Deadline Over - Reason Required", t)}\n\nPlease add the reason for not participating in the dashboard.`,
  },
  {
    key: "deadline_over_catalogue_missing_notification",
    where: (now: Date): Prisma.TenderMergedWhereInput => ({
      tenderType: "GEM",
      participated: null,
      catalogueDone: "NOT_DECIDED",
      deadline: { gte: now, lte: new Date(now.getTime() + 7 * DAY_MS) },
    }),
    message: (t: Tender, now: Date) =>
      `${header("Catalogue Missing", t, ` (in ${daysLeft(t.deadline, now)} days)`)}\n\nPlease complete the catalogue before the deadline.`,
  },
] as const;

export type WhatsAppRunResult = {
  dryRun: boolean;
  types: { key: string; tenders: number; sent: number; noRecipient: number; failed: number }[];
};

/**
 * Sends each type to the mobiles of the users assigned to the tender (Prep By, matched by email).
 * A tender is marked only when every recipient was queued, so one with no recipient yet is retried next run.
 * Outside ENVIRONMENT=PROD nothing is published or marked; the counts say what would have gone out.
 */
export async function sendWhatsAppNotifications(now = new Date()): Promise<WhatsAppRunResult> {
  const dryRun = process.env.ENVIRONMENT !== "PROD";
  const types: WhatsAppRunResult["types"] = [];

  for (const type of TYPES) {
    const tenders = await prisma.tenderMerged.findMany({
      where: {
        AND: [
          type.where(now),
          { apm: "YES", deleteRequestedAt: null },
          { OR: [{ notificationStatus: null }, { NOT: { notificationStatus: { contains: type.key } } }] },
        ],
      },
      select: TENDER_SELECT,
    });

    const emails = [...new Set(tenders.flatMap((t) => t.tenderAssociations.map((a) => a.association.email.toLowerCase())))];
    const users = await prisma.user.findMany({
      where: { email: { in: emails, mode: "insensitive" }, active: true, mobile: { not: null } },
      select: { email: true, mobile: true },
    });
    const mobileOf = new Map(users.map((u) => [u.email.toLowerCase(), u.mobile!]));

    const counts = { key: type.key, tenders: tenders.length, sent: 0, noRecipient: 0, failed: 0 };
    for (const t of tenders) {
      const mobiles = [
        ...new Set(t.tenderAssociations.flatMap((a) => mobileOf.get(a.association.email.toLowerCase()) ?? [])),
      ];
      if (mobiles.length === 0) {
        counts.noRecipient++;
        continue;
      }
      if (dryRun) {
        counts.sent++;
        continue;
      }
      const text = type.message(t, now);
      const results = await Promise.all(mobiles.map((m) => publishWhatsAppNotification(m, text)));
      if (!results.every(Boolean)) {
        counts.failed++;
        continue;
      }
      await prisma.tenderMerged.update({
        where: { id: t.id },
        data: { notificationStatus: t.notificationStatus ? `${t.notificationStatus},${type.key}` : type.key },
      });
      counts.sent++;
    }
    types.push(counts);
  }

  return { dryRun, types };
}
