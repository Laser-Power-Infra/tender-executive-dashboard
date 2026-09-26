import { readFileSync } from "node:fs";
import pg from "pg";

async function main() {
const env = readFileSync(".env", "utf8");
const url = env.split("\n").find((l) => l.startsWith("DATABASE_URL"))?.split("=").slice(1).join("=").trim().replace(/^"|"$/g, "");
if (!url) throw new Error("DATABASE_URL not found in .env");

const pool = new pg.Pool({ connectionString: url });
const dk = `coalesce(nullif(upper(btrim(t."docketNo")), ''), '__row_' || t."id"::text)`;
const r = await pool.query(`
  SELECT
    count(DISTINCT ${dk}) FILTER (WHERE t."apm"::text = 'YES' AND t."participated" IS TRUE) AS participated,
    count(DISTINCT ${dk}) FILTER (WHERE t."apm"::text = 'YES' AND t."participated" IS TRUE AND t."reverseAuctionApplicable" IS TRUE) AS with_ra,
    count(DISTINCT ${dk}) FILTER (WHERE t."apm"::text = 'YES' AND t."participated" IS TRUE AND t."reverseAuctionApplicable" IS NOT TRUE) AS without_ra
  FROM "tender_merged" t
`);
const both = await pool.query(`
  SELECT count(DISTINCT upper(btrim(t."docketNo"))) AS both_branches
  FROM "tender_merged" t
  WHERE t."apm"::text = 'YES' AND t."participated" IS TRUE
    AND upper(btrim(t."docketNo")) <> ''
    AND EXISTS (SELECT 1 FROM "tender_merged" x WHERE upper(btrim(x."docketNo")) = upper(btrim(t."docketNo")) AND x."reverseAuctionApplicable" IS TRUE)
    AND EXISTS (SELECT 1 FROM "tender_merged" y WHERE upper(btrim(y."docketNo")) = upper(btrim(t."docketNo")) AND y."reverseAuctionApplicable" IS NOT TRUE)
`);
console.log("counts:", JSON.stringify(r.rows[0]));
console.log("dockets in both branches:", JSON.stringify(both.rows[0]));
const vals = await pool.query(`
  SELECT upper(btrim(t."docketNo")) AS docket, t."reverseAuctionApplicable", count(*) AS rows
  FROM "tender_merged" t
  WHERE t."apm"::text = 'YES' AND t."participated" IS TRUE
    AND upper(btrim(t."docketNo")) <> ''
    AND EXISTS (SELECT 1 FROM "tender_merged" x WHERE upper(btrim(x."docketNo")) = upper(btrim(t."docketNo")) AND x."reverseAuctionApplicable" IS TRUE)
    AND EXISTS (SELECT 1 FROM "tender_merged" y WHERE upper(btrim(y."docketNo")) = upper(btrim(t."docketNo")) AND y."reverseAuctionApplicable" IS NOT TRUE)
  GROUP BY 1, 2 ORDER BY 1, 2
`);
console.log("per-docket values:");
for (const row of vals.rows) console.log(" ", JSON.stringify(row));
const nulls = await pool.query(`
  SELECT
    (SELECT count(*) FROM "tender_merged" t WHERE t."participated" IS NULL AND upper(btrim(t."docketNo")) <> ''
      AND EXISTS (SELECT 1 FROM "tender_merged" x WHERE upper(btrim(x."docketNo")) = upper(btrim(t."docketNo")) AND x."participated" IS NOT NULL)) AS part_null_fillable,
    (SELECT count(*) FROM "tender_merged" t WHERE t."reverseAuctionApplicable" IS NULL AND upper(btrim(t."docketNo")) <> ''
      AND EXISTS (SELECT 1 FROM "tender_merged" x WHERE upper(btrim(x."docketNo")) = upper(btrim(t."docketNo")) AND x."reverseAuctionApplicable" IS NOT NULL)) AS ra_null_fillable,
    (SELECT count(*) FROM (SELECT upper(btrim("docketNo")) d FROM "tender_merged" WHERE upper(btrim("docketNo")) <> '' GROUP BY 1 HAVING count(DISTINCT "participated") > 1) s) AS part_conflict_dockets,
    (SELECT count(*) FROM (SELECT upper(btrim("docketNo")) d FROM "tender_merged" WHERE upper(btrim("docketNo")) <> '' GROUP BY 1 HAVING count(DISTINCT "reverseAuctionApplicable") > 1) s) AS ra_conflict_dockets
`);
console.log("rule impact:", JSON.stringify(nulls.rows[0]));
await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });