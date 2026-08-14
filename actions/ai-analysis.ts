"use server";

import { openai } from "@ai-sdk/openai";
import { generateText, APICallError, Output } from "ai";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAiFeedbackContext } from "@/lib/ai-feedback";
import { logActivity } from "@/lib/activity-logger";

const model = openai("gpt-5-mini");

export async function analyzeContent(prompt: string) {
  const { text } = await generateText({
    model,
    prompt,
  });
  return text;
}

export async function analyzeContentWithSystem(system: string, prompt: string) {
  const { text } = await generateText({
    model,
    system,
    prompt,
  });
  return text;
}

type TenderAnalysisResult =
  | { success: true; data: { valid: boolean; reason: string } }
  | { success: false; error: "rate_limit" | "unknown" };

const BASE_SYSTEM_PROMPT = `You are a Tender Evaluation Expert.

Determine whether the following tender brief is specifically for the SUPPLY of any of the following products.

Eligible Products (ONLY these)

Power Cables

LT Power Cables (Armoured or Unarmoured)
MV Power Cables (Medium Voltage)
Control Cables
Signalling Cables
Aerial Bunched (AB) Cables
PVC Power Cables
XLPE Power Cables

Conductors

ACSR Conductors
AAC Conductors
AAAC Conductors
AL-59 Conductors
AL-7 Conductors
ASTER Conductors
HTLS (AECC/TS) Conductors
Medium Voltage Covered Conductors (MVCC)
Strict Inclusion Rules
The tender must explicitly involve the supply, procurement, purchase, or delivery of one or more of the above products.
If the tender is only for installation, erection, laying, stringing, testing, commissioning, maintenance, repair, replacement, O&M, turnkey/EPC works, consultancy, or services, answer NO, unless the tender explicitly includes the supply of one or more eligible products.
If the products supplied are not from the above list, answer NO.
Explicit Exclusions

Always answer NO if the tender is for any of the following:

Flexible Cables
Optical Fibre Cables (OFC), Fiber Optic Cables, ADSS, OPGW, FTTH or any telecom/communication fibre cables
Elastomeric Cables or Rubber Cables
Bare Copper Conductors
Copper Wires
House Wiring Cables
Instrumentation Cables
Welding Cables
Solar Cables
Coaxial Cables
Ethernet/LAN/Data Cables
Any cable or conductor not explicitly listed under the Eligible Products section
Output Format

Respond with a single JSON object containing exactly these two fields:
- "valid": a boolean. true if the tender is specifically for the supply of eligible cables/conductors, false otherwise.
- "reason": one concise sentence (plain text) explaining whether the tender is specifically for the supply of the eligible cables/conductors.

Do NOT use "ANSWER:", "REASON:", or any other labels/prefixes inside the "reason" value.
Important: Set "valid" to true only when the tender clearly involves the supply/procurement of one or more eligible products listed above. In every other case, set "valid" to false.`;

export async function analyzeTenderValidity(
  tenderBrief: string,
): Promise<TenderAnalysisResult> {
  try {
    const feedbackContext = await getAiFeedbackContext();
    const system = BASE_SYSTEM_PROMPT + feedbackContext;

    const { output } = await generateText({
      model,
      system,
      output: Output.object({
        schema: z.object({
          valid: z
            .boolean()
            .describe(
              "true if the tender is specifically for the supply of eligible cables/conductors, false otherwise",
            ),
          reason: z
            .string()
            .describe(
              "One concise plain-text sentence explaining the decision. No ANSWER:/REASON: labels or prefixes.",
            ),
        }),
        name: "tenderValidity",
        description:
          "Whether the tender is specifically for the supply of eligible power/control cables or conductors",
      }),
      prompt: `Analyze this tender brief:\n\n${tenderBrief}`,
    });

    const reason = output.reason
      .replace(/^ANSWER:\s*(YES|NO)\s*/i, "")
      .replace(/^REASON:\s*/i, "")
      .trim();
    return { success: true, data: { valid: output.valid, reason } };
  } catch (error) {
    console.error(error);
    if (APICallError.isInstance(error) && error.statusCode === 429) {
      return { success: false, error: "rate_limit" };
    }
    return { success: false, error: "unknown" };
  }
}

export async function saveAiRelevance(params: {
  tenderMergedId: number;
  valid: boolean;
  reason: string;
}) {
  const data = {
    aiRelevanceValid: params.valid,
    aiRelevanceReason: params.reason,
  };
  await prisma.tenderMerged.update({
    where: { id: params.tenderMergedId },
    data,
  });
  const referenceNo = (
    await prisma.tenderMerged.findUnique({
      where: { id: params.tenderMergedId },
      select: { referenceNo: true },
    })
  )?.referenceNo;

  logActivity({
    action: "UPDATE",
    tableName: "TenderMerged",
    recordId: String(params.tenderMergedId),
    referenceNo: referenceNo ?? undefined,
    details: `Set AI relevance valid=${params.valid} on tender #${params.tenderMergedId}`,
  });
}
