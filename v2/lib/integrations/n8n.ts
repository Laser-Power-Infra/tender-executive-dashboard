import "server-only"

export interface EmdWebhookPayload {
  referenceNo: string
  proposedErpItemName: string
  proposedErpQuantity: number
  lastDateOfSubmission: string
  documentFee: number
  emdAmount: number
  emdPaymentMode: string
}

export const EMD_VALID_VALUES = ["Draft", "Online", "Bank Guarantee"] as const

export async function triggerEmdPaymentWebhook(payload: EmdWebhookPayload) {
  const url = process.env.N8N_EMD_WEBHOOK_URL
  if (!url) {
    console.warn("[n8n] N8N_EMD_WEBHOOK_URL not configured, skipping webhook")
    return
  }

  console.log(`EMD webhook triggered for referenceNo ${payload.referenceNo}`)

  if (process.env.ENVIRONMENT !== "PROD") {
    console.log("[n8n] EMD webhook payload:", JSON.stringify(payload, null, 2))
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })

    console.log(`[n8n] EMD webhook response status: ${response.status}`)

    if (!response.ok) {
      console.error(`[n8n] EMD webhook returned ${response.status}: ${await response.text()}`)
    }
  } catch (error) {
    console.error("[n8n] EMD webhook failed:", error)
  }
}
