"use server";

import { openai } from "@ai-sdk/openai";
import { generateText, APICallError, Output } from "ai";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAiFeedbackContext } from "@/lib/ai-feedback";
import { logActivity } from "@/lib/activity-logger";

const model = openai("gpt-4o-mini");

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
Response Format

Respond in EXACTLY the following format:
ANSWER: YES or NO
REASON: (One concise sentence explaining whether the tender is specifically for the supply of the eligible cables/conductors.)
Important: Return YES only when the tender clearly involves the supply/procurement of one or more eligible products listed above. In every other case, return NO.`;

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
          valid: z.boolean(),
          reason: z.string(),
        }),
      }),
      prompt: `Analyze this tender brief:\n\n${tenderBrief}`,
    });
    return { success: true, data: output };
  } catch (error) {
    if (APICallError.isInstance(error) && error.statusCode === 429) {
      return { success: false, error: "rate_limit" };
    }
    return { success: false, error: "unknown" };
  }
}

export async function saveAiRelevance(params: {
  id: number;
  type: "Gem" | "Non-Gem";
  valid: boolean;
  reason: string;
}) {
  const data = {
    aiRelevanceValid: params.valid,
    aiRelevanceReason: params.reason,
  };
  if (params.type === "Gem") {
    await prisma.gemTender.update({ where: { id: params.id }, data });
  } else {
    await prisma.nonGemTender.update({ where: { id: params.id }, data });
  }
  const referenceNo = params.type === "Gem"
    ? (await prisma.gemTender.findUnique({ where: { id: params.id }, select: { referenceNo: true } }))?.referenceNo
    : (await prisma.nonGemTender.findUnique({ where: { id: params.id }, select: { referenceNo: true } }))?.referenceNo;

  logActivity({
    action: "UPDATE",
    tableName: params.type === "Gem" ? "GemTender" : "NonGemTender",
    recordId: String(params.id),
    referenceNo: referenceNo ?? undefined,
    details: `Set AI relevance valid=${params.valid} on ${params.type} tender #${params.id}`,
  });
}
