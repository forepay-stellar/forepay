/**
 * Forepay #16: the addresses the code runs against are the addresses the record
 * shows. If someone redeploys and updates only one of the two, this fails.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { RECORDED } from "./network.js";

const DOC = readFileSync(join(import.meta.dirname, "../../docs/deployments.md"), "utf8");

function recordBlock(): unknown {
  const m = /<!-- forepay:deployments -->\s*```json\n([\s\S]*?)\n```/.exec(DOC);
  assert.ok(m, "docs/deployments.md has no <!-- forepay:deployments --> JSON block");
  return JSON.parse(m[1]);
}

test("network.ts equals the record in docs/deployments.md, exactly", () => {
  assert.deepEqual(recordBlock(), RECORDED);
});

test("every recorded contract also appears in the human-readable part of the doc", () => {
  const prose = DOC.replace(/<!-- forepay:deployments -->\s*```json[\s\S]*?```/, "");
  for (const [name, address] of Object.entries(RECORDED.contracts)) {
    if (address === null) continue;
    assert.ok(prose.includes(address), `${name} ${address} is recorded but never explained in the doc`);
  }
});
