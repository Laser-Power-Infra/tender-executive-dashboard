import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import os from "os";
import { generateCertificatePdf } from "@/lib/generate-offer-pdf";
import { uploadFileToDrive } from "@/lib/gdrive";
import { logActivity } from "@/lib/activity-logger";
import { prisma } from "@/lib/prisma";
import { CertificateTemplateData } from "@/app/types/certificate";
import { SupplyHistoryRecord } from "@/types/supplyHistory";

const CERTIFICATE_FOLDER_ID = "1tbNdp-iwMeB9dO35xR35bGyuPmTLCfha";

let templateSource: string | null = null;

function loadTemplate(): string {
  if (!templateSource) {
    templateSource = fs.readFileSync(
      path.join(process.cwd(), "certificate_of_satisfactory_performance.hbs"),
      "utf-8"
    );
  }
  return templateSource;
}

function mapRowsToCertificateData(rows: SupplyHistoryRecord[]): CertificateTemplateData {
  const first = rows[0];
  const totalAmt = rows.reduce((sum, r) => sum + (r.invoiceAmt ?? 0), 0);
  return {
    partyRefNo: first.partyRefNo ?? "",
    partyRefDate: first.partyRefDate ?? "",
    partyName: first.partyName ?? "",
    fy: first.fy ?? "",
    invoiceAmt: totalAmt.toLocaleString("en-IN", { maximumFractionDigits: 2 }),
    items: rows.map((r) => ({
      itemName: r.itemName ?? "",
      invoiceQty: r.invoiceQty ?? 0,
      saleBillDate: r.saleBillDate ?? "",
    })),
  };
}

function sanitizeFileName(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, "_").slice(0, 50);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { rows } = body as { rows: SupplyHistoryRecord[] };

    if (!rows || rows.length === 0) {
      return NextResponse.json({ error: "No rows provided" }, { status: 400 });
    }

    const data = mapRowsToCertificateData(rows);
    const partyRefNo = data.partyRefNo || "NAN";

    const prevCount = await prisma.activityLog.count({
      where: { referenceNo: partyRefNo, action: "GENERATE_CERTIFICATE_PDF" },
    });
    const version = prevCount + 1;

    const versionedFileName = `Certificate_${partyRefNo}_${sanitizeFileName(data.partyName || "Unknown")}_v${version}.pdf`;

    const template = loadTemplate();

    const tempPath = path.join(os.tmpdir(), `cert_${Date.now()}_${Math.random().toString(36).slice(2, 10)}.pdf`);

    const pdfBuffer = await generateCertificatePdf(template, data, { outputPath: tempPath });

    const base64 = pdfBuffer.toString("base64");
    const result = await uploadFileToDrive(versionedFileName, "application/pdf", base64, CERTIFICATE_FOLDER_ID);

    try {
      fs.unlinkSync(tempPath);
    } catch {}

    logActivity({
      action: "GENERATE_CERTIFICATE_PDF",
      tableName: "SupplyHistory",
      referenceNo: partyRefNo,
      details: JSON.stringify({
        version,
        partyRefNo: data.partyRefNo,
        partyName: data.partyName,
        fy: data.fy,
        itemCount: data.items.length,
        invoiceAmt: data.invoiceAmt,
        driveUrl: result.url,
        fileName: versionedFileName,
      }),
    });

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${versionedFileName}"`,
        "X-Drive-Url": result.url,
      },
    });
  } catch (error: any) {
    console.error("Certificate generation failed:", error);
    return NextResponse.json(
      { error: error.message || "Failed to generate certificate" },
      { status: 500 }
    );
  }
}
