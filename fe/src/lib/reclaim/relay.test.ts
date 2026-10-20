import { describe, expect, it } from "vitest";
import { relayProveRevenue, type SignIn } from "./relay";
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
    });
    await expect(s.result).rejects.toBeInstanceOf(ReclaimCancelledError);
    expect(r.calls).toEqual([]);
  });

  it("a failed job keeps the relay's code", async () => {
    const r = relay([{ id: "j1", stage: "failed", error: { code: "account", message: "not READY" } }]);
    const s = relayProveRevenue(BORROWER, () => {}, { relayUrl: "https://r", signIn: signedIn, fetch: r.fetch, sleep: noSleep });
    const e = await s.result.catch((x) => x);
    expect(e).toBeInstanceOf(RelayError);
    expect((e as RelayError).code).toBe("account");
  });

  it("a busy relay or one already proving for this wallet is busy", async () => {
    for (const status of [409, 503]) {
      const r = relay([], { status, body: { error: "busy" } });
      const s = relayProveRevenue(BORROWER, () => {}, { relayUrl: "https://r", signIn: signedIn, fetch: r.fetch, sleep: noSleep });
      expect(((await s.result.catch((x) => x)) as RelayError).code).toBe("busy");
    }
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
    const s = relayProveRevenue(BORROWER, (st) => stages.push(st), { relayUrl: "https://r", signIn, fetch: r.fetch, sleep: noSleep });
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
