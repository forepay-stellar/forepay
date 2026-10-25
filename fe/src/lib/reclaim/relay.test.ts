import { describe, expect, it } from "vitest";
import { relayProveRevenue, type JobStore, type SignIn } from "./relay";
import { ReclaimCancelledError, RelayError, type ProveStage } from "./session";

const BORROWER = "GA2CD6PMHMBTCFAQDO3R22BSZN5ZSVTAKVNOKXL2SONZBLGRAYIOWWH2";
const REQUEST = {
  revenueUsd: "1234.56",
  pubId: "pub-1234567890123456",
  windowStart: "2026-07-01",
  windowEnd: "2026-09-30",
  timestampS: "1792467390",
  epoch: "1",
  signature: "ab".repeat(64),
  recoveryId: 1,
};

/** A relay that answers POST /proofs, then `polls` job states in turn. */
function relay(polls: object[], post: { status: number; body: object } = { status: 202, body: { id: "j1", stage: "queued" } }) {
  const calls: { url: string; init?: RequestInit }[] = [];
  let i = 0;
  const fetch = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    if (init?.method === "POST") return new Response(JSON.stringify(post.body), { status: post.status });
    return new Response(JSON.stringify(polls[Math.min(i++, polls.length - 1)]));
  }) as unknown as typeof globalThis.fetch;
  return { fetch, calls };
}

const signedIn: SignIn = async () => "ya29.token";

/** A tab's job store, in memory. */
function store(kept: { borrower: string; id: string } | null = null) {
  const s = { kept };
  const jobs: JobStore = {
    load: (b) => (s.kept?.borrower === b ? s.kept.id : null),
    save: (borrower, id) => (s.kept = { borrower, id }),
    clear: () => (s.kept = null),
  };
  return Object.assign(s, { jobs });
}
const noSleep = async () => {};

describe("relayProveRevenue", () => {
  it("signs in, hands the relay the borrower and the token, and returns request_advance's arguments", async () => {
    const r = relay([{ id: "j1", stage: "proving" }, { id: "j1", stage: "done", request: REQUEST }]);
    const stages: ProveStage[] = [];
    const s = relayProveRevenue(BORROWER, (st) => stages.push(st), {
      relayUrl: "https://relay.example/",
      signIn: signedIn,
      fetch: r.fetch,
      sleep: noSleep,
      jobs: store().jobs,
    });
    const req = await s.result;
    expect(stages).toEqual(["waiting", "reading"]);
    expect(req).toEqual({ ...REQUEST, timestampS: 1792467390n, epoch: 1n });
    expect(r.calls[0].url).toBe("https://relay.example/proofs");
    expect(JSON.parse(String(r.calls[0].init?.body))).toEqual({ borrower: BORROWER, accessToken: "ya29.token" });
    expect(r.calls.slice(1).map((c) => c.url)).toEqual(["https://relay.example/proofs/j1", "https://relay.example/proofs/j1"]);
  });

  it("closing Google's popup is the same as closing the AdSense window", async () => {
    const r = relay([]);
    const s = relayProveRevenue(BORROWER, () => {}, {
      relayUrl: "https://relay.example",
      signIn: async () => {
        throw new ReclaimCancelledError();
      },
      fetch: r.fetch,
      sleep: noSleep,
      jobs: store().jobs,
    });
    await expect(s.result).rejects.toBeInstanceOf(ReclaimCancelledError);
    expect(r.calls).toEqual([]);
  });

  it("a failed job keeps the relay's code", async () => {
    const r = relay([{ id: "j1", stage: "failed", error: { code: "account", message: "not READY" } }]);
    const s = relayProveRevenue(BORROWER, () => {}, { relayUrl: "https://r", signIn: signedIn, fetch: r.fetch, sleep: noSleep, jobs: store().jobs });
    const e = await s.result.catch((x) => x);
    expect(e).toBeInstanceOf(RelayError);
    expect((e as RelayError).code).toBe("account");
  });

  it("names the relay's refusal by its code, and by the status when there is none", async () => {
    const cases: [number, object, string][] = [
      [409, { error: "x", code: "running" }, "running"],
      [503, { error: "x", code: "busy" }, "busy"],
      [503, { error: "x", code: "unconfigured" }, "unconfigured"],
      [409, {}, "running"],
      [503, {}, "busy"],
      [500, {}, "internal"],
    ];
    for (const [status, body, code] of cases) {
      const r = relay([], { status, body });
      const s = relayProveRevenue(BORROWER, () => {}, { relayUrl: "https://r", signIn: signedIn, fetch: r.fetch, sleep: noSleep, jobs: store().jobs });
      expect(((await s.result.catch((x) => x)) as RelayError).code, `${status} ${JSON.stringify(body)}`).toBe(code);
    }
  });

  it("a relay that does not answer is unreachable, not Stellar", async () => {
    const fetch = (async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof globalThis.fetch;
    const s = relayProveRevenue(BORROWER, () => {}, { relayUrl: "https://r", signIn: signedIn, fetch, sleep: noSleep, jobs: store().jobs });
    const e = await s.result.catch((x) => x);
    expect(e).toBeInstanceOf(RelayError);
    expect((e as RelayError).code).toBe("unreachable");
  });

  it("keeps the job id while proving and forgets it once the job ends", async () => {
    const t = store();
    let seen: string | null = null;
    const fetch = (async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") return new Response(JSON.stringify({ id: "j1", stage: "queued" }), { status: 202 });
      seen = t.jobs.load(BORROWER);
      return new Response(JSON.stringify({ id: "j1", stage: "done", request: REQUEST }));
    }) as unknown as typeof globalThis.fetch;
    await relayProveRevenue(BORROWER, () => {}, { relayUrl: "https://r", signIn: signedIn, fetch, sleep: noSleep, jobs: t.jobs }).result;
    expect(seen).toBe("j1");
    expect(t.kept).toBeNull();
  });

  it("coming back to a job still running waits on it, with no second sign-in and no second proof", async () => {
    const t = store({ borrower: BORROWER, id: "j1" });
    const r = relay([{ id: "j1", stage: "proving" }, { id: "j1", stage: "done", request: REQUEST }]);
    let signIns = 0;
    const stages: ProveStage[] = [];
    const s = relayProveRevenue(BORROWER, (st) => stages.push(st), {
      relayUrl: "https://r",
      signIn: async () => {
        signIns++;
        return "ya29.token";
      },
      fetch: r.fetch,
      sleep: noSleep,
      jobs: t.jobs,
    });
    expect(await s.result).toEqual({ ...REQUEST, timestampS: 1792467390n, epoch: 1n });
    expect(signIns).toBe(0);
    expect(stages).toEqual(["reading"]);
    expect(r.calls.every((c) => c.init?.method !== "POST")).toBe(true);
    expect(t.kept).toBeNull();
  });

  it("a kept job the relay no longer has ends as gone, and never opens Google's popup outside a press", async () => {
    const t = store({ borrower: BORROWER, id: "gone" });
    const calls: string[] = [];
    const fetch = (async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? "GET"} ${url}`);
      return new Response(JSON.stringify({ error: "no such proof job" }), { status: 404 });
    }) as unknown as typeof globalThis.fetch;
    let signIns = 0;
    const signIn: SignIn = async () => {
      signIns++;
      return "ya29.token";
    };
    const stages: ProveStage[] = [];
    const s = relayProveRevenue(BORROWER, (st) => stages.push(st), { relayUrl: "https://r", signIn, fetch, sleep: noSleep, jobs: t.jobs });
    const e = await s.result.catch((x) => x);
    expect(e).toBeInstanceOf(RelayError);
    expect((e as RelayError).code).toBe("gone");
    expect(signIns).toBe(0);
    expect(stages).toEqual(["reading"]);
    expect(calls).toEqual(["GET https://r/proofs/gone"]);
    expect(t.kept).toBeNull();
  });

  it("after a gone job, the next press signs in and starts a fresh proof", async () => {
    const t = store({ borrower: BORROWER, id: "gone" });
    const fetch = (async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") return new Response(JSON.stringify({ id: "j2", stage: "queued" }), { status: 202 });
      if (url.endsWith("/gone")) return new Response(JSON.stringify({ error: "no such proof job" }), { status: 404 });
      return new Response(JSON.stringify({ id: "j2", stage: "done", request: REQUEST }));
    }) as unknown as typeof globalThis.fetch;
    const o = { relayUrl: "https://r", signIn: signedIn, fetch, sleep: noSleep, jobs: t.jobs };
    await relayProveRevenue(BORROWER, () => {}, o).result.catch(() => {});
    const stages: ProveStage[] = [];
    await relayProveRevenue(BORROWER, (st) => stages.push(st), o).result;
    expect(stages).toEqual(["waiting", "reading"]);
  });

  it("a job kept for another wallet is not this one's", async () => {
    const t = store({ borrower: "GOTHER", id: "j9" });
    const r = relay([{ id: "j1", stage: "done", request: REQUEST }]);
    await relayProveRevenue(BORROWER, () => {}, { relayUrl: "https://r", signIn: signedIn, fetch: r.fetch, sleep: noSleep, jobs: t.jobs }).result;
    expect(r.calls[0].init?.method).toBe("POST");
  });

  it("opening the window again waits on the newest popup, and an older one closing does not end it", async () => {
    let n = 0;
    const releases: ((t: string) => void)[] = [];
    const rejects: ((e: unknown) => void)[] = [];
    const signIn: SignIn = () =>
      new Promise((res, rej) => {
        n++;
        releases.push(res);
        rejects.push(rej);
      });
    const r = relay([{ id: "j1", stage: "done", request: REQUEST }]);
    const stages: ProveStage[] = [];
    const s = relayProveRevenue(BORROWER, (st) => stages.push(st), { relayUrl: "https://r", signIn, fetch: r.fetch, sleep: noSleep, jobs: store().jobs });
    s.reopen();
    expect(n).toBe(2);
    rejects[0](new ReclaimCancelledError());
    releases[1]("ya29.second");
    await s.result;
    expect(stages).toEqual(["waiting", "waiting", "reading"]);
    expect(JSON.parse(String(r.calls[0].init?.body)).accessToken).toBe("ya29.second");
  });

  it("an abandoned session stops polling and never settles", async () => {
    let polls = 0;
    const fetch = (async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") return new Response(JSON.stringify({ id: "j1", stage: "queued" }), { status: 202 });
      polls++;
      return new Response(JSON.stringify({ id: "j1", stage: "proving" }));
    }) as unknown as typeof globalThis.fetch;
    let wake!: () => void;
    const s = relayProveRevenue(BORROWER, () => {}, {
      relayUrl: "https://r",
      signIn: signedIn,
      fetch,
      sleep: () => new Promise<void>((r) => (wake = r)),
      jobs: store().jobs,
    });
    let settled = false;
    s.result.then(
      () => (settled = true),
      () => (settled = true),
    );
    await new Promise((r) => setTimeout(r, 0));
    s.abandon();
    wake();
    await new Promise((r) => setTimeout(r, 0));
    expect(polls).toBe(0);
    expect(settled).toBe(false);
  });
});
