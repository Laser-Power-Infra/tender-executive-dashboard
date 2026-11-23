import "server-only";

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

const row = z.object({
  referenceNo: z.string(),
  docketNo: z.string().nullable(),
  tenderType: z.enum(["GEM", "NON_GEM"]),
  tenderBrief: z.string().nullable(),
  organization: z.string().nullable(),
  state: z.string().nullable(),
  location: z.string().nullable(),
  deadline: z.string().nullable(),
  value: z.string().nullable(),
  emd: z.string().nullable(),
  currentStatus: z.string().nullable(),
  participated: z.boolean().nullable(),
});

const MAX_LIMIT = 200;

export function registerTenderTools(server: McpServer) {
  server.registerTool(
    "search_tenders",
    {
      title: "Search tenders",
      description: `Searches the tenders a cable and conductor manufacturer tracks (GeM and non-GeM), with reference number, docket number, brief, buyer organization, state, bid deadline, estimated value, EMD and status.
At least one filter is required.
- keywords: every keyword must appear in the tender brief (case-insensitive). Use short tokens such as "XLPE", "ABC", "11 KV", "AAAC".
- reference: text contained in the tender reference number or the docket number.
- organization: text contained in the buyer organization.
- state: text contained in the state.
- tenderType: GEM or NON_GEM.
- deadlineFrom / deadlineTo: bid deadline range, ISO dates (YYYY-MM-DD), inclusive.
Results are newest deadline first. Returns total matches and up to limit rows. When total is larger than returned, narrow the filters.`,
      annotations: { readOnlyHint: true },
      inputSchema: z.object({
        keywords: z.array(z.string()).optional().describe("Tokens that must all appear in the tender brief"),
        reference: z.string().optional().describe("Text in the reference number or docket number"),
        organization: z.string().optional().describe("Text in the buyer organization"),
        state: z.string().optional().describe("Text in the state"),
        tenderType: z.enum(["GEM", "NON_GEM"]).optional(),
        deadlineFrom: z.iso.date().optional().describe("Earliest bid deadline, YYYY-MM-DD"),
        deadlineTo: z.iso.date().optional().describe("Latest bid deadline, YYYY-MM-DD"),
        limit: z.number().int().min(1).max(MAX_LIMIT).optional().describe(`Max rows returned, default 50, max ${MAX_LIMIT}`),
      }),
      outputSchema: z.object({ total: z.number(), returned: z.number(), rows: z.array(row) }),
    },
    async ({ keywords, reference, organization, state, tenderType, deadlineFrom, deadlineTo, limit }) => {
      const words = (keywords ?? []).map((k) => k.trim()).filter(Boolean);
      const ref = reference?.trim();
      const org = organization?.trim();
      const st = state?.trim();
      if (!words.length && !ref && !org && !st && !tenderType && !deadlineFrom && !deadlineTo) {
        return {
          isError: true,
          content: [{ type: "text", text: "Give at least one filter." }],
        };
      }

      const where: Prisma.TenderMergedWhereInput = {
        // Tenders waiting for delete confirmation are hidden in the dashboard too.
        deleteRequestedAt: null,
        AND: words.map((w) => ({ tenderBrief: { contains: w, mode: "insensitive" as const } })),
        ...(ref && {
          OR: [
            { referenceNo: { contains: ref, mode: "insensitive" } },
            { docketNo: { contains: ref, mode: "insensitive" } },
          ],
        }),
        ...(org && { organization: { contains: org, mode: "insensitive" } }),
        ...(st && { state: { contains: st, mode: "insensitive" } }),
        ...(tenderType && { tenderType }),
        ...((deadlineFrom || deadlineTo) && {
          deadline: {
            ...(deadlineFrom && { gte: new Date(`${deadlineFrom}T00:00:00Z`) }),
            ...(deadlineTo && { lte: new Date(`${deadlineTo}T23:59:59.999Z`) }),
          },
        }),
      };
      const [total, tenders] = await Promise.all([
        prisma.tenderMerged.count({ where }),
        prisma.tenderMerged.findMany({
          where,
          select: {
            referenceNo: true,
            docketNo: true,
            tenderType: true,
            tenderBrief: true,
            organization: true,
            state: true,
            location: true,
            deadline: true,
            value: true,
            emd: true,
            currentStatus: true,
            participated: true,
          },
          orderBy: [{ deadline: { sort: "desc", nulls: "last" } }, { id: "desc" }],
          take: limit ?? 50,
        }),
      ]);
      const rows = tenders.map((t) => ({ ...t, deadline: t.deadline?.toISOString() ?? null }));
      const result = { total, returned: rows.length, rows };
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
        structuredContent: result,
      };
    },
  );
}
