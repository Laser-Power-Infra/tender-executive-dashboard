import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withLog } from "@/lib/activity-logger";
import { publishAiRelevanceTask } from "@/lib/queue/publisher";
import { setRelevanceQueued } from "@/lib/tender-lifecycle-store";
import { parseRupees } from "@/lib/rupees";

// "Power Distribution" -> "power_distribution"
function toSnakeCase(label: string | null | undefined): string | null {
  if (!label) return null;
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

interface TriggerAnalysisInput {
  referenceNo: string;
  company: "laser" | "gmd";
}

async function triggerAnalysis({ referenceNo, company }: TriggerAnalysisInput) {
  const tender = await prisma.tenderMerged.findUnique({
    where: { referenceNo, deleteRequestedAt: null },
    select: {
      tenderBrief: true,
      itemCategory: true,
      subCategory: true,
      value: true,
    },
  });
  if (!tender) {
    const err = new Error(`Reference not found: ${referenceNo}`);
    (err as Error & { status: number }).status = 404;
    throw err;
  }

  // Feedback is not stored. Re-run AI relevance for this tender on the
  // relevance queue; publish failure must not fail the webhook.
  const queued = await publishAiRelevanceTask({
    payloadType: "analysis",
    referenceNo,
    company,
    tenderbrief: tender.tenderBrief ?? "",
    itemcategory: tender.itemCategory ?? "",
    category: toSnakeCase(tender.subCategory),
    tenderAmount: parseRupees(tender.value),
  });
  if (!queued) {
    console.warn(
      `[feedback] Analysis job not queued for ${referenceNo} (RabbitMQ unavailable?)`,
    );
  }
  await setRelevanceQueued(referenceNo, queued);

  return { success: true, referenceNo, queued };
}

const triggerAnalysisWithLog = withLog(triggerAnalysis, (result) => ({
  action: "CREATE" as const,
  tableName: "agent:relevance",
  recordId: undefined,
  referenceNo: result.referenceNo,
  details: `Feedback received, analysis re-queued (sent=${result.queued})`,
  // Public webhook — no auth session, so label the actor explicitly.
  userId: null,
  userName: "Feedback Agent",
  userEmail: "ai-agent@laserpower.in",
}));

const COMPANIES = ["laser", "gmd"];

export async function POST(req: NextRequest) {
  try {
    const raw = await req.json();
    // Envelope ({ id, event, created_at, data }) or flat body.
    const data =
      raw?.data && typeof raw.data === "object" && !Array.isArray(raw.data)
        ? raw.data
        : raw;

    const referenceNo =
      typeof data.reference_no === "string"
        ? data.reference_no.trim()
        : typeof data.referenceNo === "string"
          ? data.referenceNo.trim()
          : "";
    const company =
      typeof data.company === "string" ? data.company.trim().toLowerCase() : "";

    if (!referenceNo) {
      return NextResponse.json({ error: "reference_no is required" }, { status: 400 });
    }
    if (!COMPANIES.includes(company)) {
      return NextResponse.json(
        { error: `company must be one of: ${COMPANIES.join(", ")}` },
        { status: 400 },
      );
    }

    const result = await triggerAnalysisWithLog({
      referenceNo,
      company: company as "laser" | "gmd",
    });
    return NextResponse.json(result);
  } catch (err) {
    const status = (err as Error & { status?: number }).status ?? 500;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status },
    );
  }
}
