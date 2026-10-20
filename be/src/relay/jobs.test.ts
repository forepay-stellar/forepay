/**
 * Forepay #17: proof jobs run one at a time, one per borrower, and a failure never
 * shows more than it should.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { ProveError } from "../adsense/account.js";
import { BorrowerBusyError, ProofJobs, QueueFullError, type Run } from "./jobs.js";
import type { AdvanceRequestJson } from "./prove.js";

const A = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
const B = "GAAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQDZ7H";
const C = "GA2CD6PMHMBTCFAQDO3R22BSZN5ZSVTAKVNOKXL2SONZBLGRAYIOWWH2";

const REQUEST: AdvanceRequestJson = {
  revenueUsd: "1234.56",
  pubId: "pub-1234567890123456",
  windowStart: "2026-07-01",
  windowEnd: "2026-09-30",
  timestampS: "1791590340",
  epoch: "1",
  signature: "ab".repeat(64),
  recoveryId: 0,
};

/** A run that waits until released, reporting `proving` meanwhile. */
function gated() {
  let release!: (v: AdvanceRequestJson) => void;
  let fail!: (e: unknown) => void;
  let started = false;
  const run: Run = (onStep) => {
    started = true;
    onStep("proving");
    return new Promise((res, rej) => {
      release = res;
      fail = rej;
    });
  };
  return { run, release: (v = REQUEST) => release(v), fail: (e: unknown) => fail(e), started: () => started };
}

const quiet = { log: () => {} };
const tick = () => new Promise((r) => setTimeout(r, 0));

test("one proof at a time; the rest wait with their place in line", async () => {
  const jobs = new ProofJobs(quiet);
  const first = gated();
  const second = gated();
  const a = jobs.submit(A, first.run);
  const b = jobs.submit(B, second.run);
  await tick();
  assert.equal(jobs.get(a.id)?.stage, "proving");
  assert.deepEqual([jobs.get(b.id)?.stage, jobs.get(b.id)?.position], ["queued", 1]);
  assert.equal(second.started(), false);

  first.release();
  await tick();
  assert.deepEqual(jobs.get(a.id)?.request, REQUEST);
  assert.equal(jobs.get(a.id)?.stage, "done");
  assert.equal(jobs.get(b.id)?.stage, "proving");
  second.release();
  await jobs.idle();
  assert.equal(jobs.get(b.id)?.stage, "done");
});

test("a borrower with a proof in progress cannot start another; after it ends, they can", async () => {
  const jobs = new ProofJobs(quiet);
  const g = gated();
  jobs.submit(A, g.run);
  assert.throws(() => jobs.submit(A, gated().run), BorrowerBusyError);
  g.release();
  await jobs.idle();
  const again = gated();
  jobs.submit(A, again.run);
  again.release();
  await jobs.idle();
});

test("past the queue limit, new jobs are refused", async () => {
  const jobs = new ProofJobs({ ...quiet, maxQueued: 1 });
  const running = gated();
  jobs.submit(A, running.run);
  await tick();
  const waiting = gated();
  jobs.submit(B, waiting.run);
  assert.throws(() => jobs.submit(C, gated().run), QueueFullError);
  running.release();
  await tick();
  waiting.release();
  await jobs.idle();
});

test("a ProveError keeps its code and scrubbed message; anything else says nothing about why", async () => {
  const jobs = new ProofJobs({ ...quiet, scrub: (t) => t.split("SECRET").join("[redacted]") });
  const known = gated();
  const k = jobs.submit(A, known.run);
  await tick();
  known.fail(new ProveError("account", "account SECRET is CLOSED"));
  await jobs.idle();
  assert.deepEqual(jobs.get(k.id)?.error, { code: "account", message: "account [redacted] is CLOSED" });

  const unknown = gated();
  const u = jobs.submit(B, unknown.run);
  await tick();
  unknown.fail(new Error("ENOENT /home/someone/.cache/circuit.wasm"));
  await jobs.idle();
  assert.equal(jobs.get(u.id)?.stage, "failed");
  assert.deepEqual(jobs.get(u.id)?.error, { code: "internal", message: "the relay failed while proving; try again" });
});

test("a finished job is readable for an hour, then gone; unknown ids are null", async () => {
  let now = 1_000_000;
  const jobs = new ProofJobs({ ...quiet, now: () => now, keepMs: 3_600_000 });
  const g = gated();
  const j = jobs.submit(A, g.run);
  g.release();
  await jobs.idle();
  now += 3_599_000;
  assert.equal(jobs.get(j.id)?.stage, "done");
  now += 2_000;
  assert.equal(jobs.get(j.id), null);
  assert.equal(jobs.get("not-a-job"), null);
});
