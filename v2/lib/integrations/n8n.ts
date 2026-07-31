import "server-only"
import { z } from "zod"

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

export const TenderItemSchema = z.object({
  description: z.string().min(1, "Item description is required"),
  quantity: z.number().positive("Quantity must be positive"),
  unit: z.string().min(1, "Unit is required"),
})

export const AttachmentSchema = z.object({
  url: z.string().url("Invalid attachment URL"),
  fileName: z.string().min(1, "File name is required"),
})

export const TenderApprovalMailRequestSchema = z.object({
  to: z.array(z.string().email("Invalid email in 'to'")).min(1, "At least one recipient is required"),
  cc: z.array(z.string().email("Invalid email in 'cc'")).optional(),
  subject: z.string().min(1, "Subject is required"),

  tenderEnquiryNo: z.string().min(1, "Tender enquiry number is required"),
  rfxNo: z.string().min(1, "RFX number is required"),

  itemDescription: z.string().min(1, "Item description is required"),

  bidSubmissionEndDate: z.string().min(1, "Bid submission end date is required"),
  extensionRemark: z.string().optional(),
  lastTenderFeePaymentDate: z.string().min(1, "Last tender fee payment date is required"),

  tenderFee: z.string().min(1, "Tender fee is required"),

  bankDetails: z.string().optional(),

  emdAmount: z.string().min(1, "EMD amount is required"),
  bgValidity: z.string().optional(),
  hardCopySubmissionDate: z.string().optional(),

  items: z.array(TenderItemSchema).min(1, "At least one item is required"),
  attachments: z.array(AttachmentSchema).optional(),
})

export type TenderApprovalMailRequest = z.infer<typeof TenderApprovalMailRequestSchema>

export interface MailWebhookResult {
  success: boolean
  message: string
  errors?: { field: string; message: string }[]
}

export async function triggerRequisitionEmailWebhook(
  payload: TenderApprovalMailRequest,
): Promise<MailWebhookResult> {
  const validation = TenderApprovalMailRequestSchema.safeParse(payload)
  if (!validation.success) {
    const errors = validation.error.issues.map((issue) => ({
      field: issue.path.join("."),
      message: issue.message,
    }))
    return { success: false, message: "Validation failed", errors }
  }

  const url = process.env.REQUISITION_EMAIL_N8N_WEBHOOK_URL
  if (!url) {
    return { success: false, message: "REQUISITION_EMAIL_N8N_WEBHOOK_URL not configured" }
  }

  console.log(`[n8n] Requisition email webhook triggered for tender ${validation.data.tenderEnquiryNo}`)

  if (process.env.ENVIRONMENT !== "PROD") {
    console.log("[n8n] Requisition email webhook payload:", JSON.stringify(validation.data, null, 2))
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validation.data),
    })

    console.log(`[n8n] Requisition email webhook response status: ${response.status}`)

    if (!response.ok) {
      const text = await response.text()
      console.error(`[n8n] Requisition email webhook returned ${response.status}: ${text}`)
      return { success: false, message: `Webhook returned ${response.status}: ${text}` }
    }

    return { success: true, message: "Requisition email webhook triggered successfully" }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error"
    console.error("[n8n] Requisition email webhook failed:", error)
    return { success: false, message: `Webhook failed: ${msg}` }
  }
}
