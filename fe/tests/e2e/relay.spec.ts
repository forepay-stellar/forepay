import { expect, test, type Page } from "@playwright/test";
import { E2E_ADDRESS } from "../../src/lib/stellar/wallet-e2e";
import { frameLedger, mockApi } from "./api";
import { mockRpc } from "./rpc";

// #17: proving through the relay, on the build whose NEXT_PUBLIC_RELAY_URL and Google client id are set
// (the relay-* projects in playwright.config.ts). Google's sign-in is a stub on `window.google`, which
// lib/reclaim/relay.ts uses when it is already there, and the relay is answered here as docs/api.md
// describes it. Everything after the proof is the stubbed contract, as in advance.spec.ts.

test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: "ignoreErrors" });
});

/** What Google's popup does when it opens: hand back a token, close, be blocked, or stay open. */
type Popup = "ok" | "closed" | "blocked" | "open";

type Gis = { mode: Popup; opened: number };
declare global {
  interface Window {
    __gis: Gis;
  }
}

/** A stand-in for Google Identity Services' token client, counting the popups it opens. */
async function stubGoogle(page: Page, mode: Popup) {
  await page.addInitScript((m: Popup) => {
    window.__gis = { mode: m, opened: 0 };
    type Config = { scope: string; callback: (r: object) => void; error_callback?: (e: object) => void };
    window.google = {
      accounts: {
        oauth2: {
          initTokenClient: (c: Config) => ({
            requestAccessToken: () => {
              window.__gis.opened++;
              const now = window.__gis.mode;
              setTimeout(() => {
                if (now === "ok") c.callback({ access_token: "ya29.e2e", scope: c.scope });
                else if (now === "closed") c.error_callback?.({ type: "popup_closed" });
                else if (now === "blocked") c.error_callback?.({ type: "popup_failed_to_open" });
              }, 600);
            },
          }),
        },
      },
    } as unknown as Window["google"];
  }, mode);
}

const opened = (page: Page) => page.evaluate(() => window.__gis.opened);

const REQUEST = {
  revenueUsd: "360.00",
  pubId: "pub-4021783466891204",
  windowStart: "2026-07-01",
  windowEnd: "2026-09-30",
  epoch: "1",
  signature: "5a".repeat(64),
  recoveryId: 0,
};

/**
 * The relay. `post` answers POST /proofs; `jobs` lists the states each job id answers in turn (the last
 * one repeats); an id not there answers 404. While `hold` is set, every job answers `proving`.
 */
type Relay = {
  post: { status: number; body: object };
  jobs: Record<string, object[]>;
  hold?: boolean;
  posts: { borrower: string; accessToken: string }[];
};

function relayFor(jobs: Relay["jobs"] = { j1: [{ id: "j1", stage: "proving" }, done("j1")] }): Relay {
  return { post: { status: 202, body: { id: "j1", stage: "queued" } }, jobs, posts: [] };
}

function done(id: string) {
  return { id, stage: "done", request: { ...REQUEST, timestampS: String(Math.floor(Date.now() / 1000)) } };
}

async function mockRelay(page: Page, relay: Relay) {
  await page.route("https://relay.e2e.invalid/**", async (route) => {
    const headers = { "access-control-allow-origin": "*" };
    const req = route.request();
    const { pathname } = new URL(req.url());
    if (req.method() === "POST" && pathname === "/proofs") {
      relay.posts.push(req.postDataJSON());
      return route.fulfill({ status: relay.post.status, headers, contentType: "application/json", body: JSON.stringify(relay.post.body) });
    }
    const id = decodeURIComponent(pathname.replace(/^\/proofs\//, ""));
    const states = relay.jobs[id];
    if (!states) return route.fulfill({ status: 404, headers, contentType: "application/json", body: '{"error":"no such proof job"}' });
    const state = relay.hold ? { id, stage: "proving" } : states.length > 1 ? states.shift() : states[0];
    return route.fulfill({ headers, contentType: "application/json", body: JSON.stringify(state) });
  });
}

async function connect(page: Page, relay: Relay, popup: Popup) {
  await stubGoogle(page, popup);
  await mockRelay(page, relay);
  await mockRpc(page, { account: true, trustline: true });
  await mockApi(page, frameLedger());
  await page.goto("/start");
  await page.getByRole("button", { name: "Get started" }).click();
  await page.getByRole("button", { name: "Connect wallet" }).click();
  await page.getByRole("dialog", { name: "Connect wallet" }).getByRole("button").first().click();
  await expect(page).toHaveURL(/\/advance$/);
}

const heading = (page: Page, name: string) => page.getByRole("heading", { name, exact: true });
const prove = (page: Page) => page.getByRole("button", { name: "Prove my revenue" }).click();

test("signs in with Google, the relay proves, and the offer follows", async ({ page }) => {
  const relay = relayFor();
  await connect(page, relay, "ok");
  await prove(page);
  await expect(heading(page, "Sign in with Google in the new window")).toBeVisible();
  await expect(heading(page, "Reading your revenue")).toBeVisible();
  await expect(page.getByText("This takes about a minute, longer when others are proving too.", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Accept 90.00 USDC" })).toBeVisible();
  expect(relay.posts).toEqual([{ borrower: E2E_ADDRESS, accessToken: "ya29.e2e" }]);
  expect(await opened(page)).toBe(1);
});

test("a Google account with no AdSense the relay can read is named", async ({ page }) => {
  const relay = relayFor({ j1: [{ id: "j1", stage: "failed", error: { code: "account", message: "no AdSense account" } }] });
  await connect(page, relay, "ok");
  await prove(page);
  await expect(heading(page, "We found no approved AdSense account")).toBeVisible();
  await expect(page.getByText("This Google account has no AdSense account we can read.", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Prove my revenue" })).toBeVisible();
});

test("closing Google's window is named, and proving can start again", async ({ page }) => {
  const relay = relayFor();
  await connect(page, relay, "closed");
  await prove(page);
  await expect(heading(page, "You closed the Google window")).toBeVisible();
  expect(relay.posts).toEqual([]);
  await page.evaluate(() => (window.__gis.mode = "ok"));
  await prove(page);
  await expect(page.getByRole("button", { name: "Accept 90.00 USDC" })).toBeVisible();
});

test("a blocked Google window is named as blocked, not closed", async ({ page }) => {
  await connect(page, relayFor(), "blocked");
  await prove(page);
  await expect(heading(page, "Your browser blocked the Google window")).toBeVisible();
});

test("a relay whose queue is full says Forepay is busy", async ({ page }) => {
  const relay = relayFor();
  relay.post = { status: 503, body: { error: "the prover is busy", code: "busy" } };
  await connect(page, relay, "ok");
  await prove(page);
  await expect(heading(page, "Forepay is busy right now")).toBeVisible();
});

test("a proof already running from a tab that lost it says to wait for it, not to pick it up", async ({ page }) => {
  const relay = relayFor();
  relay.post = { status: 409, body: { error: "a proof for this borrower is already running", code: "running" } };
  await connect(page, relay, "ok");
  await prove(page);
  await expect(heading(page, "Your proof is already being made")).toBeVisible();
  await expect(page.getByText("Wait a few minutes for it to end, then prove again.", { exact: false })).toBeVisible();
});

test("leaving while the relay proves and coming back waits on the same job, with no second sign-in", async ({ page }) => {
  const relay = relayFor();
  relay.hold = true;
  await connect(page, relay, "ok");
  await prove(page);
  await expect(heading(page, "Reading your revenue")).toBeVisible();
  // The top nav on desktop, the tab bar on a phone: whichever is shown.
  await page.getByRole("link", { name: "History", exact: true }).filter({ visible: true }).click();
  await expect(page).toHaveURL(/\/history$/);
  relay.hold = false;
  await page.getByRole("link", { name: "Advance", exact: true }).filter({ visible: true }).click();
  await expect(page.getByRole("button", { name: "Accept 90.00 USDC" })).toBeVisible();
  expect(relay.posts).toHaveLength(1);
  expect(await opened(page)).toBe(1);
});

test("a kept job the relay no longer has gets its own panel, and opens Google's window only from a press", async ({ page }) => {
  await page.addInitScript((borrower) => {
    if (window.location.pathname === "/start") {
      window.sessionStorage.setItem("forepay.proof.job", JSON.stringify({ borrower, id: "old" }));
    }
  }, E2E_ADDRESS);
  const relay = relayFor();
  await connect(page, relay, "ok");
  await expect(heading(page, "Your earlier proof has ended")).toBeVisible();
  expect(await opened(page)).toBe(0);
  expect(relay.posts).toEqual([]);
  await prove(page);
  await expect(page.getByRole("button", { name: "Accept 90.00 USDC" })).toBeVisible();
  expect(await opened(page)).toBe(1);
});
