import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withLog } from "@/lib/activity-logger";
import { publishTenderTask } from "@/lib/queue/publisher";
import { TENDER_CATEGORIES } from "@/lib/tender-categories";
import { lifecycleData, setLifecycleStatus } from "@/lib/tender-lifecycle-store";

// Incoming snake_case category -> stored EPC subcategory. Unknown/missing is ignored.
const SUBCATEGORY_BY_CATEGORY: Record<string, string> = {
  power_transmission: "Power Transmission",
  power_distribution: "Power Distribution",
  railway: "Railways",
  water_distribution: "Water Distribution",
  solar: "Solar",
};

interface UpdateAiRelevanceInput {
  referenceNo: string;
  valid: boolean;
  reason: string;
  subCategory: string | null;
}

async function updateAiRelevance({
  referenceNo,
  valid,
  reason,
  subCategory,
}: UpdateAiRelevanceInput) {
  const existing = await prisma.tenderMerged.findUnique({
    where: { referenceNo, deleteRequestedAt: null },
    select: { id: true, tenderType: true },
  });
  if (!existing) {
    const err = new Error(`Reference not found: ${referenceNo}`);
    (err as Error & { status: number }).status = 404;
    throw err;
  }

  await prisma.tenderMerged.update({
    where: { id: existing.id },
    data: {
      aiRelevanceValid: valid,
      aiRelevanceReason: reason,
      ...lifecycleData(valid ? "AUTOMATION_QUEUED" : "RELEVANCE_REJECTED"),
      ...(subCategory
        ? { category: TENDER_CATEGORIES.EPC, subCategory }
        : {}),
    },
  });

  // Only publish download job for valid tenders; publish failure must not
  // fail the webhook — the AI result is already saved.
  let downloadQueued = false;
  if (valid) {
    if (existing.tenderType === "GEM") {
      downloadQueued = await publishTenderTask({
        type: "GEM_DOWNLOAD",
        tenderId: existing.id,
        gemId: referenceNo,
        referenceNo,
        timestamp: Date.now(),
      });
    } else {
      downloadQueued = await publishTenderTask({
        type: "NON_GEM_DOWNLOAD",
        tenderId: existing.id,
        referenceNo,
        timestamp: Date.now(),
      });
    }
    if (!downloadQueued) {
      console.warn(
        `[ai-relevance] Download job not queued for ${referenceNo} (RabbitMQ unavailable?)`,
      );
      await setLifecycleStatus(referenceNo, "AUTOMATION_FAILED", "Download job not queued");
    }
  }

  return { success: true, referenceNo, valid, reason, downloadQueued };
}

const updateAiRelevanceWithLog = withLog(
  updateAiRelevance,
  (result) => ({
    action: "UPDATE" as const,
    tableName: "TenderMerged",
    recordId: undefined,
    referenceNo: result.referenceNo,
    details: `AI relevance set valid=${result.valid} queued=${result.downloadQueued}: ${result.reason}`,
    // Public webhook — no auth session, so label the actor explicitly.
    userId: null,
    userName: "Relevance Agent",
    userEmail: "ai-agent@laserpower.in",
  }),
);

async function failRelevance({ referenceNo, error }: { referenceNo: string; error: unknown }) {
  await setLifecycleStatus(referenceNo, "RELEVANCE_FAILED", error);
  return { success: true, referenceNo, handled: false };
}

const failRelevanceWithLog = withLog(failRelevance, (result, { error }) => ({
  action: "UPDATE" as const,
  tableName: "TenderMerged",
  recordId: undefined,
  referenceNo: result.referenceNo,
  details: `AI relevance failed: ${typeof error === "string" ? error : JSON.stringify(error)}`,
  // Public webhook — no auth session, so label the actor explicitly.
  userId: null,
  userName: "Relevance Agent",
  userEmail: "ai-agent@laserpower.in",
}));

const COMPANIES = ["laser", "gmd"];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const data = body?.data ?? {};
    const analysis = data?.result ?? {};
    const referenceNo =
      typeof data.reference_no === "string" ? data.reference_no.trim() : "";
    const company =
      typeof data.company === "string" ? data.company.trim().toLowerCase() : "";
    const valid = analysis.valid;
    const reason = typeof analysis.reason === "string" ? analysis.reason.trim() : "";
    const incomingCategory =
      typeof analysis.category === "string"
        ? analysis.category.trim().toLowerCase()
        : "";
    const subCategory = SUBCATEGORY_BY_CATEGORY[incomingCategory] ?? null;

    if (!referenceNo) {
      return NextResponse.json({ error: "referenceNo is required" }, { status: 400 });
    }
    // A failure event carries no verdict; record it before the verdict checks reject it.
    const failed = typeof body?.event === "string" && body.event.endsWith("_failed");
    if (data.error || failed) {
      return NextResponse.json(
        await failRelevanceWithLog({ referenceNo, error: data.error ?? body.event }),
      );
    }
    if (!COMPANIES.includes(company)) {
      return NextResponse.json(
        { error: `company must be one of: ${COMPANIES.join(", ")}` },
        { status: 400 },
      );
    }
    if (typeof valid !== "boolean") {
      return NextResponse.json({ error: "valid must be a boolean" }, { status: 400 });
    }
    if (!reason) {
      return NextResponse.json({ error: "reason is required" }, { status: 400 });
    }

    const result = await updateAiRelevanceWithLog({ referenceNo, valid, reason, subCategory });
    return NextResponse.json(result);
  } catch (err) {
    const status = (err as Error & { status?: number }).status ?? 500;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status },
    );
  }
}