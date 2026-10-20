/**
 * Proof jobs (#17): a proof takes about ten minutes, longer than any HTTP request
 * should stay open, so the relay takes the request, answers with a job id at once,
 * and the front end polls.
 *
 * One proof runs at a time. snarkjs proving saturates the CPU; two at once would
 * each take twice as long and both risk the claim's one-hour freshness.
 * The rest wait in a short queue, and the front end shows their place in it.
 *
 * Kept in memory on purpose. A job holds nothing worth keeping: the access token
 * lives only in the closure of the running job and is gone when it ends, and a
 * finished proof is stale within the hour. A restart loses the queue, and the creator
 * proves again.
 *
 * Ids are random UUIDs: knowing one is what lets you read the result, so they are
 * not guessable or sequential.
 */
import { randomUUID } from "node:crypto";

import { ProveError, type ProveErrorCode } from "../adsense/account.js";
import type { AdvanceRequestJson, ProveStep } from "./prove.js";

export type JobStage = "queued" | ProveStep | "done" | "failed";

export interface JobView {
  id: string;
  stage: JobStage;
  /** Jobs ahead of this one, while queued. */
  position?: number;
  /** When the job was accepted, seconds. */
  createdAt: number;
  /** Present when `stage` is `done`. */
  request?: AdvanceRequestJson;
  /** Present when `stage` is `failed`. */
  error?: { code: ProveErrorCode | "internal"; message: string };
}

/** Runs one job. The token is in this closure and nowhere else. */
export type Run = (onStep: (s: ProveStep) => void) => Promise<AdvanceRequestJson>;

interface Job {
  view: JobView;
  borrower: string;
  run?: Run;
  finishedAt?: number;
}

export interface JobsOptions {
  /** Jobs waiting behind the running one. Past this, new jobs are refused. */
  maxQueued?: number;
  /** How long a finished job can still be read. The proof is stale after an hour anyway. */
  keepMs?: number;
  now?: () => number;
  /** Strip secrets from a failure message before anyone can read it. */
  scrub?: (text: string) => string;
  log?: (msg: string) => void;
}

export class QueueFullError extends Error {}
export class BorrowerBusyError extends Error {}

export class ProofJobs {
  private readonly jobs = new Map<string, Job>();
  private readonly queue: Job[] = [];
  private running: Job | null = null;
  private readonly maxQueued: number;
  private readonly keepMs: number;
  private readonly now: () => number;
  private readonly scrub: (text: string) => string;
  private readonly log: (msg: string) => void;

  constructor(opts: JobsOptions = {}) {
    this.maxQueued = opts.maxQueued ?? 5;
    this.keepMs = opts.keepMs ?? 3_600_000;
    this.now = opts.now ?? Date.now;
    this.scrub = opts.scrub ?? ((t) => t);
    this.log = opts.log ?? ((m) => console.log(m));
  }

  /** Accept a job. One unfinished job per borrower: a second would only race the first. */
  submit(borrower: string, run: Run): JobView {
    this.sweep();
    if ([...this.jobs.values()].some((j) => j.borrower === borrower && !j.finishedAt)) throw new BorrowerBusyError();
    if (this.queue.length >= this.maxQueued) throw new QueueFullError();
    const job: Job = { borrower, run, view: { id: randomUUID(), stage: "queued", createdAt: Math.floor(this.now() / 1000) } };
    this.jobs.set(job.view.id, job);
    this.queue.push(job);
    void this.pump();
    return this.get(job.view.id) as JobView;
  }

  get(id: string): JobView | null {
    this.sweep();
    const job = this.jobs.get(id);
    if (!job) return null;
    const i = this.queue.indexOf(job);
    return i >= 0 ? { ...job.view, position: i + (this.running ? 1 : 0) } : { ...job.view };
  }

  /** Resolves once nothing is running or queued. For tests and shutdown. */
  async idle(): Promise<void> {
    while (this.running || this.queue.length) await new Promise((r) => setTimeout(r, 5));
  }

  private async pump(): Promise<void> {
    if (this.running) return;
    const job = this.queue.shift();
    if (!job) return;
    this.running = job;
    const run = job.run as Run;
    job.run = undefined; // drop the token's closure from the record as soon as it starts
    const started = this.now();
    try {
      job.view.request = await run((s) => {
        job.view.stage = s;
      });
      job.view.stage = "done";
    } catch (e) {
      job.view.stage = "failed";
      job.view.error =
        e instanceof ProveError
          ? { code: e.code, message: this.scrub(e.message) }
          : { code: "internal", message: "the relay failed while proving; try again" };
      if (!(e instanceof ProveError)) this.log(`proof job ${job.view.id} failed: ${this.scrub(String((e as Error).stack ?? e))}`);
    } finally {
      job.finishedAt = this.now();
      this.log(`proof job ${job.view.id} ${job.view.stage} in ${Math.round((job.finishedAt - started) / 1000)} s`);
      this.running = null;
      void this.pump();
    }
  }

  private sweep(): void {
    const cutoff = this.now() - this.keepMs;
    for (const [id, job] of this.jobs) if (job.finishedAt !== undefined && job.finishedAt < cutoff) this.jobs.delete(id);
  }
}
