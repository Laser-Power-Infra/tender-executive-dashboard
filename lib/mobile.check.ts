/**
 * Self-check for normalizeMobile. Run it with:
 *
 *   pnpm exec tsx lib/mobile.check.ts
 */
import assert from "node:assert/strict";
import { normalizeMobile } from "./mobile";

assert.equal(normalizeMobile("9876543210"), "919876543210");
assert.equal(normalizeMobile("09876543210"), "919876543210");
assert.equal(normalizeMobile("+91 98765-43210"), "919876543210");
assert.equal(normalizeMobile("919876543210"), "919876543210");
assert.equal(normalizeMobile("+1 (415) 555-2671"), "14155552671");
assert.equal(normalizeMobile("12345"), null);
assert.equal(normalizeMobile("98765abc10"), null);
assert.equal(normalizeMobile(""), null);
console.log("mobile.check: ok");
