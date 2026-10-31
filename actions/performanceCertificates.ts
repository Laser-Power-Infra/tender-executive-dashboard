"use server";

import { PDFDocument } from "pdf-lib";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { withLog } from "@/lib/activity-logger";
import { requireUserAction } from "@/lib/dal";
import { istDateKeyToDate } from "@/lib/format-ist";
import { createPresignedUpload, uploadBuffer } from "@/lib/s3";
import { publishPerformanceCertTask, type PerformanceCertFile } from "@/lib/queue/publisher";

export const getPerformanceCertificates = withLog(
  async () =>
    prisma.performanceCertificate.findMany({ orderBy: { createdAt: "desc" } }),
  () => null,
);

export const getSupplyPartyNames = withLog(async () => {
  const rows = await prisma.supplyHistory.findMany({
    distinct: ["partyName"],
    select: { partyName: true },
    where: { partyName: { not: null } },
    orderBy: { partyName: "asc" },
  });
  return rows
    .map((r) => r.partyName?.trim())
    .filter((v): v is string => Boolean(v)) as string[];
}, () => null);

export const getUtilityPartyNames = withLog(async () => {
  const rows = await prisma.tenderMerged.findMany({
    distinct: ["erpPartyName"],
    select: { erpPartyName: true },
    where: { erpPartyName: { not: null }, deleteRequestedAt: null },
    orderBy: { erpPartyName: "asc" },
  });
  return rows
    .map((r) => r.erpPartyName?.trim())
    .filter((v): v is string => Boolean(v)) as string[];
}, () => null);

export const updatePerformanceCertificatePartyName = withLog(
  async (id: string, partyName: string | null) => {
    await requireUserAction();
    return prisma.performanceCertificate.update({
      where: { id },
      data: { partyName },
    });
  },
  (result, id, partyName) => ({
    action: "UPDATE" as const,
    tableName: "PerformanceCertificate",
    recordId: String(id),
    details: `partyName -> ${partyName ?? "null"}`,
  }),
);

export type PerformanceCertificateField =
  | "utilityOrClient"
  | "useNotUse"
  | "itemSchedule"
  | "utilityNames"
  | "duplicateOfId"
  | "issueDate"
  | "signingDate";

/** Date fields arrive as `YYYY-MM-DD` and are stored as IST midnight. */
const DATE_FIELDS = new Set<PerformanceCertificateField>(["issueDate", "signingDate"]);

export const updatePerformanceCertificateField = withLog(
  async (
    id: string,
    field: PerformanceCertificateField,
    value: string | null,
  ) => {
    await requireUserAction();
    let stored: string | Date | null = value;
    if (DATE_FIELDS.has(field) && value !== null) {
      stored = istDateKeyToDate(value);
      if (!stored) throw new Error(`Invalid date: ${value}`);
    }
    return prisma.performanceCertificate.update({
      where: { id },
      data: { [field]: stored },
    });
  },
  (result, id, field, value) => ({
    action: "UPDATE" as const,
    tableName: "PerformanceCertificate",
    recordId: String(id),
    details: `${field} -> ${value ?? "null"}`,
  }),
);

/** Presigned PUT so the file goes straight to S3, not through the action. */
export const createPerformanceCertificateUpload = withLog(
  async (fileName: string, contentType: string) => {
    await requireUserAction();
    return createPresignedUpload({
      fileName,
      contentType,
      folder: "performance-certificates",
    });
  },
  () => null,
);

export const createPerformanceCertificate = withLog(
  async (certificateName: string, certificateUrl: string) => {
    await requireUserAction();
    return prisma.performanceCertificate.create({
      data: { certificateName, certificateUrl },
    });
  },
  (result) => ({
    action: "CREATE" as const,
    tableName: "PerformanceCertificate",
    recordId: result.id,
    details: result.certificateName ?? undefined,
  }),
);

/**
 * Splits a PDF certificate into one file per page — each page uploaded with the
 * parent's name plus `-page-{n}` — and adds a row per page carrying the parent's
 * other field values. PDF only.
 */
export const splitPerformanceCertificatePages = withLog(
  async (id: string) => {
    await requireUserAction();
    const parent = await prisma.performanceCertificate.findUnique({ where: { id } });
    if (!parent?.certificateUrl) throw new Error("Certificate has no file");
    if (!new URL(parent.certificateUrl).pathname.toLowerCase().endsWith(".pdf")) {
      throw new Error("Only PDF certificates can be split");
    }

    const response = await fetch(parent.certificateUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch certificate (${response.status})`);
    }
    const source = await PDFDocument.load(await response.arrayBuffer());
    const base = (parent.certificateName ?? "certificate").replace(/\.pdf$/i, "");

    const pageCount = source.getPageCount();
    for (let i = 0; i < pageCount; i++) {
      const doc = await PDFDocument.create();
      doc.addPage((await doc.copyPages(source, [i]))[0]);
      const fileName = `${base}-page-${i + 1}.pdf`;
      const { publicUrl } = await uploadBuffer(Buffer.from(await doc.save()), {
        fileName,
        contentType: "application/pdf",
        folder: "performance-certificates",
      });
      await prisma.performanceCertificate.create({
        data: {
          certificateName: fileName,
          certificateUrl: publicUrl,
          partyName: parent.partyName,
          utilityOrClient: parent.utilityOrClient,
          utilityNames: parent.utilityNames,
          itemSchedule: parent.itemSchedule,
          useNotUse: parent.useNotUse,
          issueDate: parent.issueDate,
          signingDate: parent.signingDate,
          duplicateOfId: parent.duplicateOfId,
        },
      });
    }
    return { pages: pageCount };
  },
  (result, id) => ({
    action: "CREATE" as const,
    tableName: "PerformanceCertificate",
    recordId: String(id),
    details: `Split certificate ${id} into ${result.pages} page rows`,
  }),
);

// Display id shown in the performance certificates UI.
const certId = (serial: number) => `PERF-CERT-${String(serial).padStart(4, "0")}`;

/**
 * Publishes one job per file name to the performance-certificate worker; every
 * certificate with that file name is one element in the job's `files`.
 */
export const publishPerformanceCertificateJobs = withLog(
  async () => {
    await requireUserAction();
    const certs = await prisma.performanceCertificate.findMany({
      where: { certificateUrl: { not: null } },
      select: { serial: true, certificateName: true, certificateUrl: true },
      orderBy: { serial: "asc" },
    });

    const groups = new Map<string, PerformanceCertFile[]>();
    for (const cert of certs) {
      if (!cert.certificateUrl) continue;
      const id = certId(cert.serial);
      const fileName = cert.certificateName ?? `${id}.pdf`;
      const file: PerformanceCertFile = {
        performanceCertificateId: id,
        fileUrl: cert.certificateUrl,
        fileName,
        fileTag: "performance_cert",
      };
      const list = groups.get(fileName);
      if (list) list.push(file);
      else groups.set(fileName, [file]);
    }

    let jobs = 0;
    let files = 0;
    for (const group of groups.values()) {
      const sent = await publishPerformanceCertTask({ jobId: `perfcert-${randomUUID()}`, files: group });
      if (sent) {
        jobs++;
        files += group.length;
      }
    }
    return { jobs, files };
  },
  (result) => ({
    action: "CREATE" as const,
    tableName: "PerformanceCertificate",
    details: `Published performance-cert jobs: ${result.jobs} job(s), ${result.files} file(s)`,
  }),
);
