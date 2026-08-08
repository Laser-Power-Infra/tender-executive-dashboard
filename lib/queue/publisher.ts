import { getChannel } from "@/lib/rabbitmq";
import { QUEUES } from "./config";

export type TenderTaskPayload = {
  tenderId: number;
  referenceNo?: string;
  timestamp: number;
  file_type?: "network" | "external";
  decrypted_fileId?: string;
} & (
  | { type: "GEM_DOWNLOAD"; gemId: string }
  | { type: "NON_GEM_DOWNLOAD" }
  | { type: "COSTING_ATTACHMENT_PARSING"; file_link: string }
);

async function publishToQueue(
  queue: string,
  payload: Record<string, unknown>,
): Promise<boolean> {
  const ch = await getChannel();
  if (!ch) {
    console.warn("[RabbitMQ] No channel — skipping publish");
    return false;
  }

  try {
    await ch.assertQueue(queue, { durable: true });
    const sent = ch.sendToQueue(
      queue,
      Buffer.from(JSON.stringify(payload)),
      { persistent: true },
    );
    if (!sent) {
      console.warn("[RabbitMQ] Message not sent (backpressure)");
    }
    return sent;
  } catch (err) {
    console.error("[RabbitMQ] Failed to publish task:", err);
    return false;
  }
}

export async function publishTenderTask(
  payload: TenderTaskPayload,
): Promise<boolean> {
  return publishToQueue(QUEUES.TENDER_TASKS, payload);
}

export async function publishTenderParsingTask(
  payload: TenderTaskPayload & { type: "COSTING_ATTACHMENT_PARSING" },
): Promise<boolean> {
  return publishToQueue(QUEUES.TENDER_PARSING, payload);
}

export type NonGemBoqParsingPayload = {
  type: "NON_GEM_BOQ_PARSING";
  referenceNo: string;
  file_link: string;
};

export async function publishNonGemBoqParsingTask(
  payload: NonGemBoqParsingPayload,
): Promise<boolean> {
  return publishToQueue(QUEUES.TENDER_PARSING, payload);
}

export type GemPdfParsingPayload = {
  type: "GEM_PDF_PARSING";
  referenceNo: string;
};

export async function publishGemPdfParsingTask(
  payload: GemPdfParsingPayload,
): Promise<boolean> {
  return publishToQueue(QUEUES.TENDER_PARSING, payload);
}
