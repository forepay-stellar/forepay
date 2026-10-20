/**
 * The real session (#17): Google's own sign-in popup for a read-only AdSense token, then the relay
 * proves the revenue with zkFetch and answers with `request_advance`'s arguments. The relay's API is in
 * docs/api.md, "The proof relay".
 *
 * No Reclaim SDK runs here. The proof is made on the relay because the engine Reclaim's attestor accepts
 * needs ~330 MB of circuit files and about ten minutes of CPU. The browser's part is the sign-in, and
 * the token goes once to the relay, which binds the borrower's G… inside the signed claim.
 *
 * Stages: `waiting` while Google's popup is open, `reading` from the moment the relay has the job until
 * it ends.
 */
import type { AdvanceRequest } from "@/lib/stellar/contract";
import { ReclaimCancelledError, RelayError, type ProveSession, type ProveStage, type RelayErrorCode } from "./session";

export const ADSENSE_SCOPE = "https://www.googleapis.com/auth/adsense.readonly";
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
      else reject(new TypeError("Google sign-in failed to load"));
    };
    s.onerror = () => {
      gisLoading = undefined;
      reject(new TypeError("Google sign-in failed to load (network)"));
    };
    document.head.appendChild(s);
  });
  return gisLoading;
}

/** Opens the popup each time it is called; resolves with the token, or rejects when the popup closes. */
export type SignIn = () => Promise<string>;

export function googleSignIn(clientId: string): SignIn {
  return async () => {
    const gis = await loadGis();
    return new Promise<string>((resolve, reject) => {
      const client = gis.initTokenClient({
        client_id: clientId,
        scope: ADSENSE_SCOPE,
        callback: (r) => {
          if (r.access_token && (r.scope ?? "").split(" ").includes(ADSENSE_SCOPE)) resolve(r.access_token);
          // Denied, or allowed without the AdSense box ticked: the creator stopped, nothing was read.
          else reject(new ReclaimCancelledError());
        },
        error_callback: () => reject(new ReclaimCancelledError()),
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

export type RelayOptions = {
  relayUrl: string;
  signIn: SignIn;
  fetch?: typeof fetch;
  pollMs?: number;
  /** Give up on a job after this long. Proofs take about ten minutes; the queue adds to that. */
  timeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
};

class Abandoned extends Error {}

export function relayProveRevenue(borrower: string, onStage: (stage: ProveStage) => void, o: RelayOptions): ProveSession {
  const base = o.relayUrl.replace(/\/+$/, "");
  const get = o.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const pollMs = o.pollMs ?? 5000;
  const timeoutMs = o.timeoutMs ?? 30 * 60_000;
  const sleep = o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
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
    o.signIn().then(settleToken.resolve, (e) => {
      if (mine === attempt) settleToken.reject(e);
    });
  }

  async function json<T>(res: Response): Promise<T> {
    const body = (await res.json().catch(() => ({}))) as T & { error?: unknown };
    if (!res.ok) {
      const message = typeof body.error === "string" ? body.error : `the relay answered ${res.status}`;
      throw new RelayError(res.status === 409 || res.status === 503 ? "busy" : "internal", message);
    }
    return body;
  }

  async function run(): Promise<AdvanceRequest> {
    signIn();
    const accessToken = await token;
    alive();
    reading = true;
    onStage("reading");
    const started = await json<Job>(
      await get(`${base}/proofs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ borrower, accessToken }),
      }),
    );
    const deadline = Date.now() + timeoutMs;
    let job = started;
    while (job.stage !== "done" && job.stage !== "failed") {
      if (Date.now() > deadline) throw new RelayError("prove", "the proof took too long");
      await sleep(pollMs);
      alive();
      job = await json<Job>(await get(`${base}/proofs/${encodeURIComponent(started.id)}`, { cache: "no-store" }));
    }
    alive();
    if (job.stage === "failed" || !job.request) {
      throw new RelayError(job.error?.code ?? "internal", job.error?.message ?? "the proof failed");
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
