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
