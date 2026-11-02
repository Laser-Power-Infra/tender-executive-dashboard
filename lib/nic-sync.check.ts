/**
 * Self-check for the NIC sync adapter. Run with:
 *
 *   pnpm exec tsx lib/nic-sync.check.ts
 */
import assert from "node:assert/strict";
import { nicCategoryFields, nicDocsToFiles, nicIntFields, nicTenderToRow } from "./nic-sync";
import { parseDate } from "./parse-date";

const sample = {
  category: "Manufacturing",
  sub_category: "Cables",
  "Organisation Chain": "WEST BENGAL STATE ELECTRICITY DISTRIBUTION CO. LTD||MIDNAPORE ZONE||PURBA MEDINIPUR REGION||CONTAI DIVISION",
  "Tender Reference Number": "WBSEDCL/CD/E-TENDER/2026-27/6",
  "Tender ID": "2026_WBSED_1044450_1",
  "Tender Fee in ₹": "0.00",
  "EMD Amount in ₹": "7,209",
  Title: "Laying 11kV cable",
  "Work Description": "Laying 11kV of 3cx300 sqmm XLPE Underground cable",
  "Tender Value in ₹": "3,60,466",
  "Bid Validity(Days)": "180",
  "Period Of Work(Days)": "90",
  Location: "Uttar Darua SS",
  "Bid Opening Date": "06-Nov-2026 11:00 AM",
  "Bid Submission End Date": "04-Nov-2026 06:00 PM",
  "Pre Bid Meeting Date": "NA",
  "Tenders Documents": [
    { type: "NIT", name: "Tendernotice_1.pdf", size_kb: "8328.58", url: null },
    { type: "BOQ", name: "BOQ_2561677.xls", size_kb: "311.50", url: "https://files.example/BOQ_2561677.xls" },
  ],
  reference_no: "2026_WBSED_1044450_1",
};

const row = nicTenderToRow(sample);
assert.equal(row.referenceNo, "2026_WBSED_1044450_1");
assert.equal(row.tenderBrief, "Laying 11kV of 3cx300 sqmm XLPE Underground cable");
assert.equal(row.organization, "WEST BENGAL STATE ELECTRICITY DISTRIBUTION CO. LTD");
assert.equal(row.departmentName, "MIDNAPORE ZONE / PURBA MEDINIPUR REGION / CONTAI DIVISION");
assert.equal(row.value, "3,60,466");
assert.equal(row.emd, "7,209");
assert.equal(row.source, "NIC");

// The deadline must survive the shared date parser, else the row is rejected.
const deadline = parseDate(row.deadline);
assert.ok(deadline instanceof Date, "NIC deadline parses");
assert.equal(deadline!.getFullYear(), 2026);
assert.equal(deadline!.getMonth(), 10);
assert.equal(deadline!.getDate(), 4);
assert.equal(deadline!.getHours(), 18);

assert.deepEqual(nicIntFields(sample), { bidValidityDays: 180, contractPeriodDays: 90 });
assert.deepEqual(nicIntFields({ "Bid Validity(Days)": "NA" }), {});

assert.deepEqual(nicCategoryFields(sample), { category: "Manufacturing", subCategory: "Cables & Conductors" });
assert.deepEqual(nicCategoryFields({ category: "Manufacturing", sub_category: "Rockets" }), { category: "Manufacturing", subCategory: null });
assert.deepEqual(nicCategoryFields({}), { category: "Manufacturing", subCategory: null });
assert.deepEqual(nicCategoryFields({ category: "EPC", sub_category: "Solar" }), { category: "EPC", subCategory: "Solar" });

const files = nicDocsToFiles(sample["Tenders Documents"]);
assert.equal(files.length, 1, "doc without url is skipped");
assert.equal(files[0].extension, "xls");
assert.deepEqual(files[0].tags, ["boqComparativeChart"]);
assert.equal(files[0].source, "nic-sync");
assert.deepEqual(nicDocsToFiles(undefined), []);

// Missing optional fields come through blank, not "undefined".
const sparse = nicTenderToRow({ reference_no: "X", Title: "Only title", "Organisation Chain": "NA" });
assert.equal(sparse.tenderBrief, "Only title");
assert.equal(sparse.organization, "");
assert.equal(sparse.deadline, "");

console.log("nic-sync.check: ok");
