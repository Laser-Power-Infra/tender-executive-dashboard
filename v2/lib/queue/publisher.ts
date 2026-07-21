import { getChannel } from "@/lib/rabbitmq";
import { QUEUES } from "./config";

export interface TenderTaskPayload {
  type: "GEM_DOWNLOAD";
  tenderId: number;
  gemId: string;
  referenceNo?: string;
  timestamp: number;
}

export async function publishTenderTask(
  payload: TenderTaskPayload,
): Promise<boolean> {
  const ch = await getChannel();
  if (!ch) {
    console.warn("[RabbitMQ] No channel — skipping publish");
    return false;
  }

  try {
    await ch.assertQueue(QUEUES.TENDER_TASKS, { durable: true });
    const sent = ch.sendToQueue(
      QUEUES.TENDER_TASKS,
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
