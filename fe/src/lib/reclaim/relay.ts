/**
 * The real session (#17): Google's own sign-in popup for a read-only AdSense token, then the relay
 * proves the revenue with zkFetch and answers with `request_advance`'s arguments. The relay's API is in
 * docs/api.md, "The proof relay".
 *
 * No Reclaim SDK runs here. The proof is made on the relay because the engine Reclaim's attestor accepts
 * needs ~330 MB of circuit files and a minute or more of a whole CPU. The browser's part is the sign-in, and
 * the token goes once to the relay, which binds the borrower's G… inside the signed claim.
 *
 * Stages: `waiting` while Google's popup is open, `reading` from the moment the relay has the job until
 * it ends.
 *
 * The job id is kept for the length of the tab (`sessionJobs`). A creator who leaves /advance or reloads
 * while the relay proves comes back to the same job, without a second sign-in, instead of starting a
 * second proof the relay would refuse as already running (409). A kept job the relay no longer has
 * ends the session as `gone`, so the sign-in it needs starts from a press.
 */
import type { AdvanceRequest } from "@/lib/stellar/contract";
import {
  ReclaimCancelledError,
  RelayError,
  type ProveSession,
  type ProveStage,
  type RelayErrorCode,
  type RevenueSource,
} from "./session";

export const ADSENSE_SCOPE = "https://www.googleapis.com/auth/adsense.readonly";
export const ADMOB_SCOPE = "https://www.googleapis.com/auth/admob.readonly";
/** One read-only scope per source, never both (#97). */
const SCOPES: Record<RevenueSource, string> = { adsense: ADSENSE_SCOPE, admob: ADMOB_SCOPE };
const GIS_SRC = "https://accounts.google.com/gsi/client";

/** The slice of Google Identity Services' token client used here. */
type TokenResponse = { access_token?: string; error?: string; scope?: string };
type TokenClient = { requestAccessToken: (o?: { prompt?: string }) => void };
type Gis = {
  initTokenClient: (config: {
    client_id: string;
    scope: string;
    callback: (r: TokenResponse) => void;
    error_callback?: (e: { type?: string }) => void;
  }) => TokenClient;
};
declare global {
  interface Window {
    google?: { accounts?: { oauth2?: Gis } };
  }
}

let gisLoading: Promise<Gis> | undefined;

/** Load Google's script once. */
function loadGis(): Promise<Gis> {
  const ready = () => window.google?.accounts?.oauth2;
  const existing = ready();
  if (existing) return Promise.resolve(existing);
  gisLoading ??= new Promise<Gis>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = GIS_SRC;
    s.async = true;
    s.onload = () => {
      const gis = ready();
      if (gis) resolve(gis);
      else reject(new RelayError("googleUnavailable", "Google sign-in failed to load"));
    };
    s.onerror = () => {
      gisLoading = undefined;
      reject(new RelayError("googleUnavailable", "Google sign-in failed to load (network)"));
    };
    document.head.appendChild(s);
  });
  return gisLoading;
}

/**
 * Load Google's script ahead of the press, so "Prove my revenue" opens the popup inside the click.
 * Loaded only then, the popup opens after an await, outside the click, and browsers may block it.
 */
export function preloadGoogleSignIn(): void {
  loadGis().catch(() => {
    // The press will try again and report it.
  });
}

/**
 * Opens the popup each time it is called, asking for the source's scope; resolves with the token, or
 * rejects when the popup closes.
 */
export type SignIn = (source: RevenueSource) => Promise<string>;

export function googleSignIn(clientId: string): SignIn {
  return async (source) => {
    const gis = await loadGis();
    const scope = SCOPES[source];
    return new Promise<string>((resolve, reject) => {
      const client = gis.initTokenClient({
        client_id: clientId,
        scope,
        callback: (r) => {
          if (r.access_token && (r.scope ?? "").split(" ").includes(scope)) resolve(r.access_token);
          // Denied, or allowed without the reports box ticked: the creator stopped, nothing was read.
          else reject(new ReclaimCancelledError());
        },
        error_callback: (e) =>
          reject(
            e.type === "popup_failed_to_open"
              ? new RelayError("popupBlocked", "the browser blocked Google's sign-in window")
              : new ReclaimCancelledError(),
          ),
      });
      client.requestAccessToken();
    });
  };
}

/** A relay job, as `GET /proofs/:id` answers it. */
type Job = {
  id: string;
  stage: "queued" | "checking" | "proving" | "auditing" | "done" | "failed";
  request?: Omit<AdvanceRequest, "timestampS" | "epoch"> & { timestampS: string; epoch: string };
  error?: { code: RelayErrorCode; message: string };
};

/** A job this tab started, and which source it proves. */
export type KeptJob = { id: string; source: RevenueSource };

/** Where the running job's id waits while the creator is away from /advance. */
export type JobStore = {
  load: (borrower: string) => KeptJob | null;
  save: (borrower: string, job: KeptJob) => void;
  clear: () => void;
};

// One slot for the tab: proving with a second wallet in the same tab replaces the first wallet's id.
// Rare, and that wallet then proves again once its job ends.
const JOB_KEY = "forepay.proof.job";

/**
 * The job id, for the length of the tab. Only the id: the token never leaves the sign-in, and the id
 * reads nothing the relay would not show this tab anyway. One for another wallet is not this one's.
 */
export const sessionJobs: JobStore = {
  load: (borrower) => {
    try {
      const s = JSON.parse(window.sessionStorage.getItem(JOB_KEY) ?? "null") as
        | { borrower: string; id: string; source?: RevenueSource }
        | null;
      // Kept before #97 named the source: those were AdSense.
      return s?.borrower === borrower ? { id: s.id, source: s.source === "admob" ? "admob" : "adsense" } : null;
    } catch {
      return null;
    }
  },
  save: (borrower, { id, source }) => {
    try {
      window.sessionStorage.setItem(JOB_KEY, JSON.stringify({ borrower, id, source }));
    } catch {
      // Storage unavailable: leaving the page while proving loses the job, as before.
    }
  },
  clear: () => {
    try {
      window.sessionStorage.removeItem(JOB_KEY);
    } catch {
      // nothing to clear
    }
  },
};

export type RelayOptions = {
  relayUrl: string;
  /** What a new proof proves, AdSense by default. A kept job proves what it was started for. */
  source?: RevenueSource;
  signIn: SignIn;
  fetch?: typeof fetch;
  jobs?: JobStore;
  pollMs?: number;
  /**
   * Give up on a job after this long. A proof takes about a minute on the relay, more behind a queue;
   * past an hour the claim is too old for the contract anyway, and the relay has forgotten the job.
   */
  timeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
};

const CODES: readonly RelayErrorCode[] = ["token", "account", "empty", "running", "busy", "unconfigured", "provider", "prove", "audit", "internal"];

class Abandoned extends Error {}

export function relayProveRevenue(borrower: string, onStage: (stage: ProveStage) => void, o: RelayOptions): ProveSession {
  const base = o.relayUrl.replace(/\/+$/, "");
  const send = o.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const jobs = o.jobs ?? sessionJobs;
  const pollMs = o.pollMs ?? 5000;
  const timeoutMs = o.timeoutMs ?? 60 * 60_000;
  const sleep = o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  // A kept job proves the source it was started for, whatever this press chose.
  const kept = jobs.load(borrower);
  const source = kept?.source ?? o.source ?? "adsense";
  let abandoned = false;
  let reading = false;
  let attempt = 0;
  let settleToken!: { resolve: (t: string) => void; reject: (e: unknown) => void };
  const token = new Promise<string>((resolve, reject) => {
    settleToken = { resolve, reject };
  });

  const alive = () => {
    if (abandoned) throw new Abandoned();
  };

  /**
   * Open Google's popup. Opened again ("Open the window again"), the newest popup is the one whose
   * closing counts: a popup lost behind another window may never answer.
   */
  function signIn() {
    const mine = ++attempt;
    onStage("waiting");
    o.signIn(source).then(settleToken.resolve, (e) => {
      if (mine === attempt) settleToken.reject(e);
    });
  }

  /** A relay that does not answer is the relay's, not Stellar's (review on #75). */
  async function call(url: string, init?: RequestInit): Promise<Response> {
    try {
      return await send(url, init);
    } catch (e) {
      throw new RelayError("unreachable", `the relay did not answer: ${(e as Error)?.message ?? e}`);
    }
  }

  async function json<T>(res: Response): Promise<T> {
    const body = (await res.json().catch(() => ({}))) as T & { error?: unknown; code?: unknown };
    if (!res.ok) {
      const message = typeof body.error === "string" ? body.error : `the relay answered ${res.status}`;
      // The relay names the refusal in `code` (docs/api.md); the status is the fallback.
      const code = CODES.find((c) => c === body.code) ?? (res.status === 409 ? "running" : res.status === 503 ? "busy" : "internal");
      throw new RelayError(code, message, source);
    }
    return body;
  }

  /** Poll a job until it ends. Null when the relay no longer has it (it restarted, or an hour passed). */
  async function follow(id: string, first?: Job): Promise<Job | null> {
    const deadline = Date.now() + timeoutMs;
    let job = first;
    while (!job || (job.stage !== "done" && job.stage !== "failed")) {
      if (Date.now() > deadline) throw new RelayError("prove", "the proof took too long");
      if (job) await sleep(pollMs);
      alive();
      const res = await call(`${base}/proofs/${encodeURIComponent(id)}`, { cache: "no-store" });
      if (res.status === 404) return null;
      job = await json<Job>(res);
    }
    return job;
  }

  async function prove(): Promise<Job> {
    // A job this tab started before the creator left: wait on it rather than sign in again.
    if (kept) {
      reading = true;
      onStage("reading");
      const job = await follow(kept.id);
      if (job) return job;
      // The relay no longer has it (it restarted, or the hour passed). Signing in again here would open
      // Google's popup outside any press, on mount or after an await, and the browser would block it
      // (review on #75). The creator's next press opens it instead.
      jobs.clear();
      throw new RelayError("gone", "the relay no longer has this proof job", source);
    }
    signIn();
    const accessToken = await token;
    alive();
    reading = true;
    onStage("reading");
    const started = await json<Job>(
      await call(`${base}/proofs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // `source` only for AdMob: an AdSense request stays what it was before #97, for relays without it.
        body: JSON.stringify(source === "admob" ? { borrower, accessToken, source } : { borrower, accessToken }),
      }),
    );
    jobs.save(borrower, { id: started.id, source });
    const job = await follow(started.id, started);
    if (!job) throw new RelayError("internal", "the relay lost the proof job", source);
    return job;
  }

  async function run(): Promise<AdvanceRequest> {
    const job = await prove();
    alive();
    // Ended either way: the next press starts a new proof. Left alone while abandoned, so coming back
    // finds the result.
    jobs.clear();
    if (job.stage === "failed" || !job.request) {
      throw new RelayError(job.error?.code ?? "internal", job.error?.message ?? "the proof failed", source);
    }
    return { ...job.request, timestampS: BigInt(job.request.timestampS), epoch: BigInt(job.request.epoch) };
  }

  // Never settles once abandoned, as the session promises.
  const result = new Promise<AdvanceRequest>((resolve, reject) => {
    run().then(resolve, (e) => {
      if (!(e instanceof Abandoned) && !abandoned) reject(e);
    });
  });

  return {
    result,
    reopen: () => {
      if (!reading && !abandoned) signIn();
    },
    abandon: () => {
      abandoned = true;
    },
  };
}
