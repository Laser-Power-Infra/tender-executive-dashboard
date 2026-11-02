/**
 * Self-check for reference matching in the shared tender upsert. Run with:
 *
 *   pnpm exec tsx lib/tender-upsert.check.ts
 */
import assert from "node:assert/strict";
import { pickExistingReference } from "./tender-upsert";

const stored = ["2026_WBSED_1044450", "2026_WBSED_1044450_1", "GEM/2026/B/123456", "abcd", "ABCDEF"];

// Exact match, case-insensitive, beats any prefix match.
assert.equal(pickExistingReference("2026_WBSED_1044450", stored), "2026_WBSED_1044450");
assert.equal(pickExistingReference("gem/2026/b/123456", stored), "GEM/2026/B/123456");

// Incoming longer than stored: "abcd -> abcd1234" is the same tender.
assert.equal(pickExistingReference("2026_WBSED_1044450_1_2", stored), "2026_WBSED_1044450_1");
assert.equal(pickExistingReference("GEM/2026/B/123456/CORR", stored), "GEM/2026/B/123456");

// Stored longer than incoming also matches; the most specific stored reference is taken.
assert.equal(pickExistingReference("2026_WBSED_10444", stored), "2026_WBSED_1044450_1");

// Short references only match exactly: "abcd" must not claim "abcdef".
assert.equal(pickExistingReference("abcd", stored), "abcd");
assert.equal(pickExistingReference("abc", stored), undefined);
assert.equal(pickExistingReference("abcdef1", stored), "ABCDEF");

// Unrelated references create a new tender.
assert.equal(pickExistingReference("2026_MPSED_999", stored), undefined);
assert.equal(pickExistingReference("X", []), undefined);

console.log("tender-upsert.check: ok");
