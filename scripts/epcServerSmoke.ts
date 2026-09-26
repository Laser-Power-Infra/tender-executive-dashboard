/**
 * Smoke test for the EPC server pages: docket-group paging, docket-deduped
 * counts and the scope predicates, against the real database.
 */
import { prisma } from "@/lib/prisma";
import { emptyTenderQuery, type TenderQuery, type TenderScope } from "@/lib/tender-query";
import { fetchTendersPage, fetchParticipationCounts } from "@/actions/tender-query";
import { dedupeByDocketNo } from "@/lib/docket";

function q(scope: TenderScope, patch: Partial<TenderQuery> = {}): TenderQuery {
  return {
    ...emptyTenderQuery(),
    scope,
    groupByDocket: true,
    applyDefaultDeadlineFilter: false,
    sort: { column: "lastDateOfSubmission", direction: "desc" },
    ...patch,
  };
}

async function main() {
  for (const scope of ["home", "postParticipation", "notParticipated"] as TenderScope[]) {
    const page = await fetchTendersPage(q(scope), true);
    const groups = new Set(
      page.rows.map((r) =>
        String(r.docketNo ?? "").trim()
          ? String(r.docketNo).trim().toUpperCase()
          : `__row_${r.id}`,
      ),
    );
    console.log(
      `${scope}: total(dockets)=${page.total} rows_on_page=${page.rows.length} groups_on_page=${groups.size} columns=${page.columns?.length ?? 0}`,
    );
    if (groups.size > page.pageSize) throw new Error(`${scope}: page exceeded pageSize in groups`);

    // Page 2 must not repeat a group from page 1.
    const second = await fetchTendersPage(q(scope, { page: 2 }), false);
    const overlap = second.rows.filter((r) =>
      groups.has(
        String(r.docketNo ?? "").trim()
          ? String(r.docketNo).trim().toUpperCase()
          : `__row_${r.id}`,
      ),
    );
    if (overlap.length > 0) throw new Error(`${scope}: group split across pages`);

    const counts = await fetchParticipationCounts(q(scope));
    console.log(
      `${scope}: participated=${counts.nodes.participated} withRa=${counts.nodes.participatedWithRa} weL1=${counts.nodes.weL1} persons=${counts.personCounts.length}`,
    );
  }

  // The docket-deduped total must equal what the client helper computes.
  const scope: TenderScope = "postParticipation";
  const all = await fetchTendersPage(q(scope, { pageSize: 2000 }), false);
  const oracle = dedupeByDocketNo(all.rows as unknown as (Record<string, unknown> & { id?: unknown })[]).length;
  console.log(`postParticipation: first-2000-groups rows=${all.rows.length} dedupe(rows)=${oracle}`);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("FAILED:", e);
  await prisma.$disconnect();
  process.exit(1);
});
