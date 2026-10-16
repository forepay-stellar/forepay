import { expect, test, type Page } from "@playwright/test";
import { mockRpc, type Chain } from "./rpc";

// #19: connect, the USDC trustline check, disconnect and reload, with the test wallet.

async function connectFromStart(page: Page) {
  await page.goto("/start");
  await page.getByRole("button", { name: "Get started" }).click();
  await page.getByRole("button", { name: "Connect wallet" }).click();
}

test("a wallet without USDC is asked to allow it, then moves on", async ({ page }) => {
  const chain: Chain = { account: true, trustline: false };
  await mockRpc(page, chain);
  await connectFromStart(page);

  await expect(page.getByText("Freighter connected").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Let your wallet receive USDC" })).toBeVisible();
  await expect(page.getByText("Not allowed yet")).toBeVisible();

  await page.getByRole("button", { name: "Allow USDC" }).click();
  await expect(page.getByRole("button", { name: "Prove my revenue" })).toBeVisible();
  await expect(page.getByText("Your wallet can receive USDC")).toBeVisible();

  await page.getByRole("button", { name: "Prove my revenue" }).click();
  await expect(page).toHaveURL(/\/advance$/);
});

test("a wallet that already holds USDC goes straight on", async ({ page }) => {
  await mockRpc(page, { account: true, trustline: true });
  await connectFromStart(page);
  await expect(page).toHaveURL(/\/advance$/);
});

test("a new wallet with no XLM is told to fund it first", async ({ page }) => {
  await mockRpc(page, { account: false, trustline: false });
  await connectFromStart(page);
  await expect(page.getByRole("heading", { name: "Add test XLM to your wallet first" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Get test XLM" })).toBeVisible();
});

test("a ledger that does not answer is never read as an empty wallet", async ({ page }) => {
  await mockRpc(page, { account: true, trustline: false, down: true });
  await connectFromStart(page);
  await expect(page.getByRole("heading", { name: "We could not check your wallet" })).toBeVisible();
  await expect(page.getByText("Not allowed yet")).toHaveCount(0);
});

test("reload keeps the wallet, disconnect clears it", async ({ page }) => {
  await mockRpc(page, { account: true, trustline: false });
  await connectFromStart(page);
  await expect(page.getByText("Not allowed yet")).toBeVisible();

  await page.reload();
  await expect(page.getByText("Not allowed yet")).toBeVisible();

  await page.getByRole("button", { name: /^Wallet / }).first().click();
  await page.getByRole("menuitem", { name: "Disconnect" }).click();
  await expect(page.getByRole("heading", { name: "Get paid early on the AdSense revenue you already earn" })).toBeVisible();

  // Still disconnected after a reload.
  await page.reload();
  await expect(page.getByRole("heading", { name: "Get paid early on the AdSense revenue you already earn" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Wallet / })).toHaveCount(0);
});

test("the wallet menu copies the address", async ({ page, context, browserName }) => {
  test.skip(browserName !== "chromium", "clipboard permissions are Chromium only");
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await mockRpc(page, { account: true, trustline: false });
  await connectFromStart(page);
  const chip = page.getByRole("button", { name: /^Wallet / }).first();
  await chip.click();
  // The chip stays the white pill while its menu is open (onboarding board, "Wallet menu").
  await expect(chip).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await page.getByRole("menuitem", { name: "Copy address" }).click();
  await expect(page.getByText("Address copied")).toBeVisible();
});

const failures: { scenario: string; heading: string; action: string; role: "button" | "link" }[] = [
  { scenario: "wrong-network", heading: "Switch your wallet to testnet", action: "Try again", role: "button" },
  { scenario: "declined", heading: "You closed the wallet window", action: "Connect wallet", role: "button" },
  { scenario: "locked", heading: "Unlock Freighter first", action: "Connect wallet", role: "button" },
  { scenario: "no-wallet", heading: "Install a Stellar wallet", action: "Get Freighter", role: "link" },
];

for (const f of failures) {
  test(`connecting can fail with "${f.heading}"`, async ({ page }) => {
    await mockRpc(page, { account: true, trustline: false });
    await page.addInitScript((s) => window.localStorage.setItem("forepay.e2e.scenario", s), f.scenario);
    await connectFromStart(page);
    await expect(page.getByRole("heading", { name: f.heading })).toBeVisible();
    await expect(page.getByRole(f.role, { name: f.action })).toBeVisible();
    // A failed connect never leaves a half-saved session behind.
    await expect(page.getByRole("button", { name: /^Wallet / })).toHaveCount(0);
  });
}

test("an unrecognised wallet error gets its own panel, not a guess", async ({ page }) => {
  await mockRpc(page, { account: true, trustline: false });
  await page.addInitScript(() => window.localStorage.setItem("forepay.e2e.scenario", "broken"));
  await connectFromStart(page);
  await expect(page.getByRole("heading", { name: "Your wallet did not connect" })).toBeVisible();
});

test("failure copy names the wallet the creator chose", async ({ page }) => {
  await mockRpc(page, { account: true, trustline: false });
  await page.addInitScript(() => {
    window.localStorage.setItem("forepay.e2e.scenario", "locked");
    window.localStorage.setItem("forepay.e2e.wallet", "xBull");
  });
  await connectFromStart(page);
  await expect(page.getByRole("heading", { name: "Unlock xBull first" })).toBeVisible();
  await expect(page.getByText("Open xBull, enter your password, then connect again.")).toBeVisible();
});

test("a refused approval says nothing was charged", async ({ page }) => {
  await mockRpc(page, { account: true, trustline: false, send: "refused" });
  await connectFromStart(page);
  await page.getByRole("button", { name: "Allow USDC" }).click();
  await expect(page.getByRole("heading", { name: "The transaction did not go through" })).toBeVisible();
  await expect(page.getByText("Nothing was charged. Try again in a moment.")).toBeVisible();
  await expect(page.locator('[data-illo="nothing-charged"]')).toBeVisible();
});

test("an approval that fails on the ledger does not claim nothing was charged", async ({ page }) => {
  await mockRpc(page, { account: true, trustline: false, send: "failed" });
  await connectFromStart(page);
  await page.getByRole("button", { name: "Allow USDC" }).click();
  await expect(page.getByRole("heading", { name: "USDC was not allowed" })).toBeVisible();
  await expect(page.getByText(/Nothing was charged/)).toHaveCount(0);
  await expect(page.locator('[data-illo="nothing-charged"]')).toHaveCount(0);
  await expect(page.locator('[data-illo="not-allowed"]')).toBeVisible();
});

test("turning the signature down goes back to 1c without an error", async ({ page }) => {
  await mockRpc(page, { account: true, trustline: false });
  await connectFromStart(page);
  await expect(page.getByText("Not allowed yet")).toBeVisible();
  await page.evaluate(() => window.localStorage.setItem("forepay.e2e.scenario", "decline-sign"));
  await page.getByRole("button", { name: "Allow USDC" }).click();
  await expect(page.getByText("Not allowed yet")).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  // No error panel. (Next.js keeps its own role="alert" route announcer on every page.)
  await expect(page.getByRole("heading", { name: /did not go through|was not allowed|not confirmed/ })).toHaveCount(0);
});

test("Cancel closes the dialog, and a late approval is still confirmed, not redirected", async ({ page }) => {
  const chain: Chain = { account: true, trustline: false };
  await mockRpc(page, chain);
  // Hold the submission so the dialog stays open long enough to cancel.
  let release: () => void = () => {};
  const held = new Promise<void>((r) => (release = r));
  await page.route("https://rpc.e2e.invalid/**", async (route) => {
    if ((route.request().postDataJSON() as { method: string }).method === "sendTransaction") await held;
    await route.fallback();
  });
  await connectFromStart(page);
  await page.getByRole("button", { name: "Allow USDC" }).click();
  await expect(page.getByRole("dialog", { name: "Approve in Freighter" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("Not allowed yet")).toBeVisible();
  release();
  // The wallet approved after all: the ledger says so, and the creator sees the confirmation.
  await expect(page.getByText("Your wallet can receive USDC")).toBeVisible();
  await expect(page.getByRole("button", { name: "Prove my revenue" })).toBeVisible();
  await expect(page).toHaveURL(/\/start$/);
});

test("Get test XLM funds a new wallet and moves on to Allow USDC", async ({ page }) => {
  await mockRpc(page, { account: false, trustline: false });
  await connectFromStart(page);
  await page.getByRole("button", { name: "Get test XLM" }).click();
  await expect(page.getByText("Not allowed yet")).toBeVisible();
});

test("a ledger that comes back after failing can be checked again", async ({ page }) => {
  const chain: Chain = { account: true, trustline: false, down: true };
  await mockRpc(page, chain);
  await connectFromStart(page);
  await expect(page.getByRole("heading", { name: "We could not check your wallet" })).toBeVisible();
  chain.down = false;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByText("Not allowed yet")).toBeVisible();
});

test("Use a different wallet returns to 1b", async ({ page }) => {
  await mockRpc(page, { account: true, trustline: false });
  await connectFromStart(page);
  await page.getByRole("button", { name: "Use a different wallet" }).click();
  await expect(page.getByRole("heading", { name: "Connect your wallet" })).toBeVisible();
});

test("the app keeps the wallet on reload, and Disconnect there starts over at 1a", async ({ page }) => {
  await mockRpc(page, { account: true, trustline: true });
  await connectFromStart(page);
  await expect(page).toHaveURL(/\/advance$/);
  await page.reload();
  await expect(page).toHaveURL(/\/advance$/);
  await expect(page.getByRole("button", { name: /^Wallet / })).toBeVisible();
  await page.getByRole("button", { name: /^Wallet / }).click();
  await page.getByRole("menuitem", { name: "Disconnect" }).click();
  await expect(page.getByRole("heading", { name: "Get paid early on the AdSense revenue you already earn" })).toBeVisible();
});

test("a wallet moved off testnet since the last visit is caught on reload", async ({ page }) => {
  await mockRpc(page, { account: true, trustline: false });
  await connectFromStart(page);
  await expect(page.getByText("Not allowed yet")).toBeVisible();
  await page.evaluate(() => window.localStorage.setItem("forepay.e2e.scenario", "wrong-network"));
  await page.reload();
  await expect(page.getByRole("heading", { name: "Switch your wallet to testnet" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Wallet / })).toHaveCount(0);
});

test("a wallet that cannot report its network connects and stays connected after a reload", async ({ page }) => {
  await mockRpc(page, { account: true, trustline: false });
  await page.addInitScript(() => {
    window.localStorage.setItem("forepay.e2e.scenario", "no-network-api");
    window.localStorage.setItem("forepay.e2e.wallet", "xBull");
  });
  await connectFromStart(page);
  await expect(page.getByText("xBull connected").first()).toBeVisible();
  await expect(page.getByText("Not allowed yet")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Not allowed yet")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Unlock xBull first" })).toHaveCount(0);
});

test("a wallet locked since the last visit is dropped on reload, not trusted until signing", async ({ page }) => {
  await mockRpc(page, { account: true, trustline: false });
  await connectFromStart(page);
  await expect(page.getByText("Not allowed yet")).toBeVisible();
  await page.evaluate(() => window.localStorage.setItem("forepay.e2e.scenario", "locked"));
  await page.reload();
  await expect(page.getByRole("heading", { name: "Get paid early on the AdSense revenue you already earn" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Wallet / })).toHaveCount(0);
});

test("a locked xBull is not caught on reload, since it cannot be asked silently", async ({ page }) => {
  await mockRpc(page, { account: true, trustline: false });
  await page.addInitScript(() => window.localStorage.setItem("forepay.e2e.wallet", "xBull"));
  await connectFromStart(page);
  await expect(page.getByText("Not allowed yet")).toBeVisible();
  await page.evaluate(() => window.localStorage.setItem("forepay.e2e.scenario", "locked"));
  await page.reload();
  await expect(page.getByText("Not allowed yet")).toBeVisible();
});

test("the stepper stays centred on desktop once the wallet chip shows", async ({ page, isMobile }) => {
  test.skip(isMobile, "the phone header has no stepper");
  await mockRpc(page, { account: true, trustline: false });
  await connectFromStart(page);
  await expect(page.getByRole("button", { name: /^Wallet / }).first()).toBeVisible();
  const box = await page.getByRole("list", { name: "Onboarding progress" }).boundingBox();
  // 1440 wide: the 480px stepper sits at 480 to 960, as in the frames.
  expect(box?.x).toBeCloseTo(480, 0);
  expect(box?.width).toBeCloseTo(480, 0);

  // 1024, where the top bar first shows: it still fits, the stepper narrower but between the sides.
  await page.setViewportSize({ width: 1024, height: 768 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(1024);
  const narrow = await page.getByRole("list", { name: "Onboarding progress" }).boundingBox();
  expect(narrow?.width).toBeGreaterThan(200);
});
