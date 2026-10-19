import { expect, test, type Page } from "@playwright/test";
import { E2E_ADDRESS } from "../../src/lib/stellar/wallet-e2e";
import { frameLedger, mockApi } from "./api";
import { mockRpc, type Chain } from "./rpc";

// #70: section 08 of the design ("No sideways scroll"). Every app screen is exactly as wide as the
// window at 320, 375, 768, 1024, 1280 and 1440. Each state is set up once, then measured at every
// width; a soft check per width, so one run lists every place that still overflows.

const WIDTHS = [320, 375, 768, 1024, 1280, 1440];

test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: "ignoreErrors" });
});

/** Resize to each width and check the page is no wider than the window. */
async function holdsAtEveryWidth(page: Page, what: string) {
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    // Let a layout that depends on the width (a media query in JS) settle.
    await page.waitForTimeout(150);
    const scroll = await page.evaluate(() => document.documentElement.scrollWidth);
    expect.soft(scroll, `${what} at ${width}: page is ${scroll} wide`).toBeLessThanOrEqual(width);
    // Nor may anything spill out of its own box: a label past its pill, a figure past its tile.
    const spills = await page.evaluate(() => {
      const out: string[] = [];
      for (const el of document.body.querySelectorAll<HTMLElement>("*")) {
        const style = getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden" || style.position === "fixed") continue;
        if (["auto", "scroll", "hidden", "clip"].includes(style.overflowX)) continue;
        if (el.closest("[aria-hidden='true'], svg, nextjs-portal, .sr-only")) continue;
        const label = () => (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 40);
        if (el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0) {
          out.push(`${el.tagName.toLowerCase()} "${label()}" ${el.scrollWidth}>${el.clientWidth}`);
        }
        // Centred content spills on both sides, which scrollWidth does not count, and a label may run
        // into its pill's padding: measure its own text against its content box.
        if (style.display === "inline" || style.display === "contents") continue;
        const rect = el.getBoundingClientRect();
        const box = {
          left: rect.left + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft),
          right: rect.right - parseFloat(style.borderRightWidth) - parseFloat(style.paddingRight),
        };
        for (const node of el.childNodes) {
          if (node.nodeType !== Node.TEXT_NODE || !node.textContent?.trim()) continue;
          const range = document.createRange();
          range.selectNodeContents(node);
          const text = range.getBoundingClientRect();
          if (text.width === 0) continue;
          if (text.left < box.left - 1 || text.right > box.right + 1) {
            out.push(`${el.tagName.toLowerCase()} "${label()}" text ${Math.round(text.width)} past ${Math.round(box.right - box.left)}`);
          }
        }
      }
      return out;
    });
    expect.soft(spills, `${what} at ${width}: content wider than its box`).toEqual([]);
  }
}

/** A returning creator whose wallet is connected, without going through 1b. */
async function connected(page: Page) {
  await page.addInitScript((address) => {
    localStorage.setItem("forepay.wallet", address);
    localStorage.setItem("forepay.wallet.name", "Freighter");
    localStorage.setItem("forepay.e2e.connected", "1");
  }, E2E_ADDRESS);
}

const heading = (page: Page, name: string) => page.getByRole("heading", { name, exact: true });

// The states are set up at the desktop size; the phone project would repeat the same widths.
test.beforeEach(({ isMobile }) => {
  test.skip(isMobile, "each test walks every width itself");
});

test("onboarding: 1a, 1b and the no-wallet panel", async ({ page }) => {
  await mockRpc(page, { account: true, trustline: false });
  await page.goto("/start");
  await expect(heading(page, "Get paid early on the AdSense revenue you already earn")).toBeVisible();
  await holdsAtEveryWidth(page, "1a");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("button", { name: "Get started" }).click();
  await expect(heading(page, "Connect your wallet")).toBeVisible();
  await holdsAtEveryWidth(page, "1b");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => localStorage.setItem("forepay.e2e.scenario", "no-wallet"));
  await page.getByRole("button", { name: "Connect wallet" }).click();
  await expect(heading(page, "Install a Stellar wallet")).toBeVisible();
  await holdsAtEveryWidth(page, "1b no wallet");
});

test("onboarding: 1c Allow USDC", async ({ page }) => {
  await mockRpc(page, { account: true, trustline: false });
  await connected(page);
  await page.goto("/start");
  await expect(page.getByText("Not allowed yet")).toBeVisible();
  await holdsAtEveryWidth(page, "1c");
});

test("prove and accept: 2a, 2b, and a two-button panel", async ({ page }) => {
  const chain: Chain = { account: true, trustline: true };
  await mockRpc(page, chain);
  await connected(page);
  await page.addInitScript(() => localStorage.setItem("forepay.mock.revenue", "1240.00"));
  await page.goto("/advance");
  await expect(heading(page, "See how much you can get")).toBeVisible();
  await expect(page.getByText("A quarter of your proven revenue, up to 100 USDC.")).toBeVisible();
  await holdsAtEveryWidth(page, "2a");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("button", { name: "Prove my revenue" }).click();
  await expect(page.getByRole("button", { name: "Accept 100.00 USDC" })).toBeVisible();
  await holdsAtEveryWidth(page, "2b");
  await page.setViewportSize({ width: 1440, height: 900 });
  // USDC no longer allowed when accepting: "Approve in Freighter" and "Not now".
  chain.trustline = false;
  await page.getByRole("button", { name: "Accept 100.00 USDC" }).click();
  await expect(heading(page, "Your wallet needs to accept USDC first")).toBeVisible();
  await holdsAtEveryWidth(page, "2 code 41");
});

test("repayment and history", async ({ page }) => {
  await mockApi(page, frameLedger());
  await mockRpc(page, { account: true, trustline: true, usdc: 8_200_000_000n, contract: {} });
  await connected(page);
  await page.goto("/repayment");
  await expect(page.getByRole("region", { name: "What is left to repay" })).toContainText("60.00");
  await page.getByRole("button", { name: "Full amount" }).click();
  await holdsAtEveryWidth(page, "3a");
  await page.goto("/history");
  await expect(page.getByText("October 2026").first()).toBeVisible();
  await holdsAtEveryWidth(page, "3b");
});

test("repayment and history before the first advance", async ({ page }) => {
  await mockApi(page, { advances: [], transactions: [] });
  await mockRpc(page, { account: true, trustline: true, usdc: 0n, contract: {} });
  await connected(page);
  await page.goto("/repayment");
  await expect(heading(page, "No advance yet")).toBeVisible();
  await holdsAtEveryWidth(page, "3a no advance");
  await page.goto("/history");
  await expect(heading(page, "No advance yet")).toBeVisible();
  await holdsAtEveryWidth(page, "3b no advance");
});

/** Width of the box `locate` finds, at each window width. */
async function widths(page: Page, locate: () => ReturnType<Page["locator"]>, at: number[]) {
  const out: Record<number, number> = {};
  for (const width of at) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(150);
    out[width] = Math.round((await locate().boundingBox())?.width ?? 0);
  }
  return out;
}

test("columns follow section 08: 640 on a tablet, 1200 at most, a side column of 320 then 360", async ({ page }) => {
  await mockApi(page, frameLedger());
  await mockRpc(page, { account: true, trustline: true, usdc: 8_200_000_000n, contract: {} });
  await connected(page);
  await page.goto("/repayment");
  await expect(page.getByRole("region", { name: "What is left to repay" })).toContainText("60.00");
  // The content box: the window less its gutters (32, 40, 80), never past 640 on a tablet or 1200.
  expect(await widths(page, () => page.locator("main"), [768, 834, 1024, 1199, 1280, 1440])).toEqual({
    768: 640,
    834: 640,
    1024: 944,
    1199: 1119,
    1280: 1120,
    1440: 1200,
  });
  // The side column: under the main cards on a tablet, then 320, and 360 from a 1200 window.
  const form = () => page.getByRole("form", { name: "Make a repayment" });
  expect(await widths(page, form, [834, 1024, 1199, 1200, 1440])).toEqual({ 834: 640, 1024: 320, 1199: 320, 1200: 360, 1440: 360 });

  await page.addInitScript(() => localStorage.setItem("forepay.mock.revenue", "1240.00"));
  await page.goto("/advance");
  await expect(page.getByText("A quarter of your proven revenue, up to 100 USDC.")).toBeVisible();
  const wallet = () => page.getByRole("region", { name: "Your wallet" });
  expect(await widths(page, wallet, [1024, 1199, 1200, 1440])).toEqual({ 1024: 320, 1199: 320, 1200: 360, 1440: 360 });
});

test("the top nav keeps the wordmark whole from 768", async ({ page }) => {
  await mockApi(page, frameLedger());
  await mockRpc(page, { account: true, trustline: true, usdc: 8_200_000_000n, contract: {} });
  await connected(page);
  await page.goto("/history");
  await expect(page.getByText("October 2026").first()).toBeVisible();
  const wordmark = () => page.getByRole("banner").getByRole("img", { name: "Forepay" }).first();
  expect(await widths(page, wordmark, [768, 800, 834, 1024, 1440])).toEqual({ 768: 179, 800: 179, 834: 179, 1024: 179, 1440: 179 });
});

/** Whether the two buttons sit one under the other, at each window width. */
async function stackedAt(page: Page, first: string, second: string, at: number[]) {
  const out: Record<number, boolean> = {};
  for (const width of at) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(150);
    const a = await page.getByRole("button", { name: first }).boundingBox();
    const b = await page.getByRole("button", { name: second }).boundingBox();
    out[width] = !!a && !!b && b.y >= a.y + a.height;
  }
  return out;
}

test("under 768 two buttons stack, main first, unless the pair fits at 320", async ({ page }) => {
  const chain: Chain = { account: true, trustline: true, advance: { send: "refused" } };
  await mockRpc(page, chain);
  await connected(page);
  await page.addInitScript(() => localStorage.setItem("forepay.mock.revenue", "1240.00"));
  await page.goto("/advance");
  await page.getByRole("button", { name: "Prove my revenue" }).click();
  await expect(page.getByRole("button", { name: "Accept 100.00 USDC" })).toBeVisible();
  // "Approve in Freighter" (or "Allow USDC") and "Not now" do not fit side by side at 320.
  chain.trustline = false;
  await page.getByRole("button", { name: "Accept 100.00 USDC" }).click();
  await expect(heading(page, "Your wallet needs to accept USDC first")).toBeVisible();
  const allow = (await page.getByRole("button", { name: /Allow USDC|Approve in/ }).first().textContent()) ?? "";
  expect(await stackedAt(page, allow.trim(), "Not now", [320, 375, 390, 767, 768, 1440])).toEqual({
    320: true,
    375: true,
    390: true,
    767: true,
    768: false,
    1440: false,
  });
  // "Try again" and "Back" do.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("button", { name: "Not now" }).click();
  chain.trustline = true;
  await page.getByRole("button", { name: "Accept 100.00 USDC" }).click();
  await expect(heading(page, "The transaction did not go through")).toBeVisible();
  expect(await stackedAt(page, "Try again", "Back", [320, 768, 1440])).toEqual({ 320: false, 768: false, 1440: false });
  await holdsAtEveryWidth(page, "refused panel");
});

test("the repay chips share their row equally, and the balance circles sit where drawn", async ({ page }) => {
  await mockApi(page, frameLedger());
  await mockRpc(page, { account: true, trustline: true, usdc: 8_200_000_000n, contract: {} });
  await connected(page);
  await page.goto("/repayment");
  await expect(page.getByRole("region", { name: "What is left to repay" })).toContainText("60.00");
  for (const [width, oneRow] of [[834, true], [1024, false], [1440, true], [320, false]] as const) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(150);
    const [quarter, half, full] = await Promise.all(
      ["25%", "50%", "Full amount"].map(async (name) => (await page.getByRole("button", { name }).boundingBox())!),
    );
    // One row of three equal chips, or Full amount alone under two equal ones.
    expect(Math.round(quarter.width), `chips at ${width}`).toBe(Math.round(half.width));
    expect(full.y > quarter.y, `Full amount on a second row at ${width}`).toBe(!oneRow);
    if (oneRow) expect(Math.round(full.width), `chips at ${width}`).toBe(Math.round(half.width));
    if (width === 320) continue; // no circles on a phone
    // Every 3a frame: the circles at 560 and 610 from the card's left edge.
    const lefts = await page.getByRole("region", { name: "What is left to repay" }).evaluate((card) => {
      const at = card.getBoundingClientRect().left;
      return [...card.querySelectorAll<HTMLElement>(":scope > span[aria-hidden]")].map((c) => Math.round(c.getBoundingClientRect().left - at));
    });
    expect(lefts, `circles at ${width}`).toEqual([560, 610]);
  }
});

test("a transaction's title is never cut short, even at 320", async ({ page }) => {
  await mockApi(page, frameLedger());
  await mockRpc(page, { account: true, trustline: true, usdc: 8_200_000_000n, contract: {} });
  await connected(page);
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/history");
  await expect(page.getByText("October 2026").first()).toBeVisible();
  const cut = await page.getByRole("listitem").evaluateAll((rows) =>
    rows.flatMap((row) => [...row.querySelectorAll<HTMLElement>("span")].filter((s) => s.scrollWidth > s.clientWidth + 1).map((s) => s.textContent)),
  );
  expect(cut).toEqual([]);
  await expect(page.getByText("Advance received", { exact: true })).toBeVisible();
});

