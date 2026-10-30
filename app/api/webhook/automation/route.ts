import { prisma } from "@/lib/prisma";
import { createWebhookHandler, httpError, type WebhookEvent } from "@/lib/webhook-event";
import {
  INGESTION_FILE_SELECT,
  publishIngestionTask,
  publishTenderFileParsingTask,
  requireClientId,
  type TenderFileParsingPayload,
} from "@/lib/queue/publisher";
import { TENDER_FILE_TYPES, type TenderFileType } from "@/lib/tender-file-types";
import { setLifecycleStatus } from "@/lib/tender-lifecycle-store";

// Per download type: parsing job type and the only file tag sent for parsing.
const PARSING: Record<string, { type: TenderFileParsingPayload["type"]; tag: TenderFileType }> = {
  GEM_DOWNLOAD: { type: "GEM_PDF_PARSING", tag: TENDER_FILE_TYPES.TENDER_DOCUMENT },
  RA_GEM_DOWNLOAD: { type: "RA_GEM_PDF_PARSING", tag: TENDER_FILE_TYPES.TENDER_DOCUMENT },
  NON_GEM_DOWNLOAD: { type: "NON_GEM_BOQ_PARSING", tag: TENDER_FILE_TYPES.BOQ_COMPARATIVE_CHART },
};

interface FetchedFile {
  name: string;
  extension: string;
  url: string;
  tag: string;
  source: string;
}

const VALID_TAGS = new Set<string>(Object.values(TENDER_FILE_TYPES));

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function parseFiles(result: unknown): FetchedFile[] {
  const files = (result as { files?: unknown } | null)?.files;
  if (!Array.isArray(files)) throw httpError("data.result.files must be an array", 400);

  return files.map((f, i) => {
    if (
      !f ||
      !isNonEmptyString(f.name) ||
      !isNonEmptyString(f.url) ||
      !isNonEmptyString(f.source) ||
      typeof f.extension !== "string"
    ) {
      throw httpError(`data.result.files[${i}] needs name, extension, url and source`, 400);
    }
    const tag = tagFromName(f.name) ?? f.tag;
    if (!VALID_TAGS.has(tag)) {
      throw httpError(`data.result.files[${i}].tag must be one of: ${[...VALID_TAGS].join(", ")}`, 400);
    }
    return { name: f.name, extension: f.extension, url: f.url.trim(), tag, source: f.source };
  });
}

// File names mentioning boq or costing override the worker's tag; otherwise the worker's tag is kept.
function tagFromName(name: string): TenderFileType | null {
  const lower = name.toLowerCase();
  if (lower.includes("boq")) return TENDER_FILE_TYPES.BOQ_COMPARATIVE_CHART;
  if (lower.includes("costing")) return TENDER_FILE_TYPES.COSTING_ATTACHMENT;
  return null;
}

async function handleAutomationEvent(evt: WebhookEvent) {
  if (evt.event !== "file.fetched_success" || evt.data.error) {
    // Any other event without an error is only logged.
    if (evt.data.error || evt.event.endsWith("_failed")) {
      await setLifecycleStatus(evt.data.referenceNo, "AUTOMATION_FAILED", evt.data.error ?? evt.event);
    }
    return { handled: false };
  }

  const parsing = PARSING[evt.data.type];
  if (!parsing) {
    throw httpError(`data.type must be one of: ${Object.keys(PARSING).join(", ")}`, 400);
  }

  // Fail before saving files: a retry skips saved URLs, so their parsing jobs would never be queued.
  requireClientId("TENDER_AUTOMATION_PARSING_CLIENT_ID");
  requireClientId("TENDER_AGENT_INGESTION_CLIENT_ID");

  const files = parseFiles(evt.data.result);
  const { referenceNo } = evt.data;

  const tender = await prisma.tenderMerged.findUnique({
    where: { referenceNo, deleteRequestedAt: null },
    select: { id: true, lifecycleStatus: true },
  });
  if (!tender) throw httpError(`Reference not found: ${referenceNo}`, 404);

  // Skip URLs already stored so a retried webhook does not duplicate rows or parsing jobs.
  const existing = await prisma.tenderFile.findMany({
    where: { tenderMergedId: tender.id, url: { in: files.map((f) => f.url) } },
    select: { url: true },
  });
  const seen = new Set(existing.map((f) => f.url));
  const newFiles = files.filter((f) => !seen.has(f.url) && seen.add(f.url));
  const parsingFiles = newFiles.filter((f) => f.tag === parsing.tag);

  await prisma.tenderFile.createMany({
    data: newFiles.map((f) => ({
      name: f.name,
      extension: f.extension,
      url: f.url,
      source: f.source,
      tags: [f.tag],
      tenderMergedId: tender.id,
      // Only parsing candidates are PENDING; other files are never sent for parsing.
      parseStatus: f.tag === parsing.tag ? "PENDING" : null,
    })),
  });

  // Publish failures must not fail the webhook — the files are already saved.
  let parsingQueued = 0;
  for (const f of parsingFiles) {
    const ok = await publishTenderFileParsingTask({
      type: parsing.type,
      referenceNo,
      file_link: f.url,
    });
    if (ok) {
      parsingQueued++;
      continue;
    }
    console.warn(`[automation] Parsing job not queued for ${referenceNo} ${f.url} (RabbitMQ unavailable?)`);
    // A file that never reached the queue must not stay PENDING.
    await prisma.tenderFile.updateMany({
      where: { tenderMergedId: tender.id, url: f.url },
      data: { parseStatus: "FAILED", parseError: "Parsing job not queued" },
    });
  }

  // Ingestion runs in parallel with parsing. Published when this event saved new files, or when the tender
  // still waits on its download: a re-analysed tender has its files stored already, so none is new.
  // A repeated event finds the tender past AUTOMATION_QUEUED and does not re-publish.
  let ingestionQueued = false;
  if (newFiles.length > 0 || tender.lifecycleStatus === "AUTOMATION_QUEUED") {
    const tenderFiles = await prisma.tenderFile.findMany({
      where: { tenderMergedId: tender.id },
      select: INGESTION_FILE_SELECT,
      orderBy: { id: "asc" },
    });
    ingestionQueued =
      tenderFiles.length > 0 && (await publishIngestionTask({ referenceNo, files: tenderFiles }));
    if (!ingestionQueued && tenderFiles.length > 0) {
      console.warn(`[automation] Ingestion job not queued for ${referenceNo} (RabbitMQ unavailable?)`);
    }
    await (ingestionQueued
      ? setLifecycleStatus(referenceNo, "INGESTION_QUEUED")
      : setLifecycleStatus(
          referenceNo,
          "INGESTION_FAILED",
          tenderFiles.length > 0 ? "Ingestion job not queued" : "No files to ingest",
        ));
  }

  return { handled: true, filesCreated: newFiles.length, parsingQueued, ingestionQueued };
}

export const POST = createWebhookHandler("Automation", handleAutomationEvent);
