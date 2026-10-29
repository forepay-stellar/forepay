import { expect, test, type Page } from "@playwright/test";
import { mockRpc, type Chain } from "./rpc";

// #20: prove revenue, review the offer, sign, receive, and every state on the "Prove and accept /
// States and interactions" board. Proving runs on the lib/reclaim mock (#17 is not built). Everything
// after it is the real contract client against the stubbed RPC in ./rpc.ts, which answers `quote`,
// `request_advance` (simulated and sent), `nullifier_for` and `advance` the way the contract does.

// A test can end while the page still has a request in the stub (a query refetching, a held
// simulation). Drop the stub without waiting for those, or a handler left waiting on a closed page
// keeps the Playwright worker from exiting.
test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: "ignoreErrors" });
});

async function connect(page: Page, chain: Chain, mock: Record<string, string> = {}) {
  await mockRpc(page, chain);
  await page.goto("/start");
  await page.getByRole("button", { name: "Get started" }).click();
  await page.getByRole("button", { name: "Connect wallet" }).click();
  // The picker opens in its dialog; the test wallet is its first row.
  await page.getByRole("dialog", { name: "Connect wallet" }).getByRole("button").first().click();
  await expect(page).toHaveURL(/\/advance$/);
  await page.evaluate((m) => {
    for (const [k, v] of Object.entries(m)) window.localStorage.setItem(k, v);
  }, mock);
}

const heading = (page: Page, name: string) => page.getByRole("heading", { name, exact: true });

async function proveToOffer(page: Page) {
  await page.getByRole("button", { name: "Prove my revenue" }).click();
  await expect(page.getByRole("button", { name: /^Accept / })).toBeVisible();
}

test("prove, see the offer with its derivation, accept, and receive the USDC", async ({ page }) => {
  const chain: Chain = { account: true, trustline: true, advance: { acceptDelayMs: 1500 } };
  await connect(page, chain);

  // Hold the check on Stellar long enough to see it.
  await page.route("https://rpc.e2e.invalid/**", async (route) => {
    const body = route.request().postDataJSON() as { method: string };
    // The quote and the check now run side by side, so hold each long enough to see the screen.
    if (body.method === "simulateTransaction" && !chain.advance?.sent) await new Promise((r) => setTimeout(r, 1000));
    await route.fallback();
  });

  // 2a. Arriving does not move focus.
  await expect(heading(page, "Get an advance")).toBeVisible();
  await expect(heading(page, "See how much you can get")).toBeVisible();
  await expect(heading(page, "See how much you can get")).not.toBeFocused();
  // The window is the contract's to say, so 2a names no months before a proof exists. (The list is the
  // desktop layout's; a phone does not show it.)
  await expect(page.getByText("Revenue from the last three complete months")).toBeAttached();
  await page.getByRole("button", { name: "Prove my revenue" }).click();

  // The Reclaim session, then the check on Stellar
  await expect(heading(page, "Sign in with Google in the new window")).toBeVisible();
  await expect(page.getByRole("button", { name: "Open the window again" })).toBeVisible();
  await expect(heading(page, "Reading your revenue")).toBeVisible();
  await expect(heading(page, "Checking your proof")).toBeVisible();

  // 2b: the contract's figure and how it was reached
  await expect(heading(page, "Your offer")).toBeVisible();
  // Focus lands on the offer itself, so a screen reader starts with the amount.
  await expect(page.getByRole("region", { name: "You can get 90.00 USDC" })).toBeFocused();
  await expect(page.getByText("Revenue verified")).toBeVisible();
  await expect(page.getByText("A quarter of the $360.00 you earned on AdSense from July to September.")).toBeVisible();
  const breakdown = page.getByRole("region", { name: "How we got this number" });
  await expect(breakdown.getByText("$360.00", { exact: true })).toBeVisible();
  await expect(breakdown.getByText("× 25%")).toBeVisible();
  await expect(breakdown.getByText("100.00 USDC", { exact: true })).toBeVisible();
  await expect(breakdown.getByText("Your advance")).toBeVisible();
  await expect(breakdown).toContainText("90.00USDC");
  await expect(breakdown.getByText("25% of $360.00 is 90.00 USDC.")).toBeVisible();

  // 2c, held open by the slow simulation of the accept
  await page.getByRole("button", { name: "Accept 90.00 USDC" }).click();
  await expect(heading(page, "Approve in Freighter")).toBeVisible();
  await expect(page.getByText("You receive")).toBeVisible();

  // 2d
  await expect(heading(page, "Advance received")).toBeVisible();
  await expect(heading(page, "The USDC is in your wallet")).toBeVisible();
  await expect(page.getByText("+90")).toBeVisible();
  await expect(page.getByText("12 Oct 2026")).toBeVisible();
  await expect(page.getByText("90.00 USDC", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "View receipt" })).toHaveAttribute(
    "href",
    `https://stellar.expert/explorer/testnet/tx/${chain.advance?.hash}`,
  );
  expect(chain.advance?.sent).toBe(1);

  await page.getByRole("link", { name: "Go to repayment" }).click();
  await expect(page).toHaveURL(/\/repayment$/);
});

test("leaving while the USDC is sent still shows its receipt on coming back", async ({ page }) => {
  const chain: Chain = { account: true, trustline: true, advance: { holdLedger: true } };
  await connect(page, chain);
  await proveToOffer(page);
  await page.getByRole("button", { name: "Accept 90.00 USDC" }).click();
  await expect(heading(page, "Sending your USDC")).toBeVisible();

  // The tab bar is right there: the creator leaves, and the transaction lands meanwhile. A cold dev
  // server compiles each page on its first visit, which can outlast the default wait under a full
  // parallel run, so each move waits longer than the rest of the suite needs.
  await page.getByRole("link", { name: "Repayment" }).click();
  await expect(page).toHaveURL(/\/repayment$/, { timeout: 20_000 });
  chain.advance!.holdLedger = false;
  await page.getByRole("link", { name: "Advance" }).click();
  await expect(page).toHaveURL(/\/advance$/, { timeout: 20_000 });

  await expect(heading(page, "Advance received")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("link", { name: "View receipt" })).toHaveAttribute(
    "href",
    `https://stellar.expert/explorer/testnet/tx/${chain.advance?.hash}`,
  );
  expect(chain.advance?.sent).toBe(1);
});

test("a reload while the USDC is sent goes on waiting for it", async ({ page }) => {
  const chain: Chain = { account: true, trustline: true, advance: { holdLedger: true } };
  await connect(page, chain);
  await proveToOffer(page);
  await page.getByRole("button", { name: "Accept 90.00 USDC" }).click();
  await expect(heading(page, "Sending your USDC")).toBeVisible();
  // Record whether 2a ever paints after the reload, even for a frame.
  await page.addInitScript(() => {
    new MutationObserver(() => {
      if (document.body?.innerText.includes("See how much you can get")) window.localStorage.setItem("saw2a", "1");
    }).observe(document, { subtree: true, childList: true, characterData: true });
  });
  await page.reload();
  await expect(heading(page, "Sending your USDC")).toBeVisible();
  expect(await page.evaluate(() => window.localStorage.getItem("saw2a"))).toBeNull();
  chain.advance!.holdLedger = false;
  await expect(heading(page, "Advance received")).toBeVisible();
  // Landed and shown: a later visit starts over at 2a.
  await page.reload();
  await expect(heading(page, "See how much you can get")).toBeVisible();
});

for (const back of ["after", "before"] as const) {
  test(`a send refused ${back === "after" ? "while the creator is away" : "after they come back"} says so at once, not after two minutes`, async ({
    page,
  }) => {
    const chain: Chain = { account: true, trustline: true, advance: { send: "refused", holdSend: true } };
    await connect(page, chain);
    await proveToOffer(page);
    await page.getByRole("button", { name: "Accept 90.00 USDC" }).click();
    await expect(heading(page, "Sending your USDC")).toBeVisible();
    await expect.poll(() => chain.advance?.sent).toBe(1);

    await page.getByRole("link", { name: "Repayment" }).click();
    await expect(page).toHaveURL(/\/repayment$/, { timeout: 20_000 });
    if (back === "after") chain.advance!.holdSend = false;
    await page.getByRole("link", { name: "Advance" }).click();
    await expect(page).toHaveURL(/\/advance$/, { timeout: 20_000 });
    if (back === "before") {
      await expect(heading(page, "Sending your USDC")).toBeVisible({ timeout: 20_000 });
      chain.advance!.holdSend = false;
    }

    // Well inside the two-minute wait for a transaction that may still land.
    await expect(heading(page, "The transaction did not go through")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Nothing was charged and no USDC moved. Try again in a moment.")).toBeVisible();
    chain.advance!.send = "ok";
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(heading(page, "The USDC is in your wallet")).toBeVisible();
    expect(chain.advance?.sent).toBe(2);
  });
}

test("a high revenue is capped at 100 USDC and says so", async ({ page }) => {
  await connect(page, { account: true, trustline: true }, { "forepay.mock.revenue": "1240.00" });
  await proveToOffer(page);
  await expect(page.getByRole("button", { name: "Accept 100.00 USDC" })).toBeVisible();
  await expect(
    page.getByText("The most one advance can be. You earned $1,240.00 on AdSense from July to September."),
  ).toBeVisible();
  await expect(page.getByText("A quarter of $1,240.00 is more than 100 USDC. Each advance is limited to 100 USDC.")).toBeVisible();
});

test("Stellar not answering when coming back to a sent advance keeps it, and Try again waits on it", async ({
  page,
}) => {
  const chain: Chain = { account: true, trustline: true, advance: { holdLedger: true } };
  await connect(page, chain);
  await proveToOffer(page);
  await page.getByRole("button", { name: "Accept 90.00 USDC" }).click();
  await expect(heading(page, "Sending your USDC")).toBeVisible();

  // Back on the page with the node down: the advance is not given up on.
  chain.advance!.dropPolls = 1000;
  await page.reload();
  await expect(heading(page, "We could not reach Stellar")).toBeVisible();
  await expect(page.getByText("Your advance was already sent.", { exact: false })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open History" })).toBeVisible();

  // The node is back and the advance has landed: Try again waits on the same one, sends nothing new.
  chain.advance!.dropPolls = 0;
  chain.advance!.holdLedger = false;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(heading(page, "Advance received")).toBeVisible();
  expect(chain.advance?.sent).toBe(1);
});

test("a send whose answer is lost is remembered, and Try again finds it landed", async ({ page }) => {
  const chain: Chain = { account: true, trustline: true, advance: { loseSendAnswer: true } };
  await connect(page, chain);
  await proveToOffer(page);
  await page.getByRole("button", { name: "Accept 90.00 USDC" }).click();
  // It may be out, so it is not "took too long" and not "nothing was charged".
  await expect(heading(page, "We could not reach Stellar")).toBeVisible();
  await expect(page.getByText("Your advance was already sent.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(heading(page, "Advance received")).toBeVisible();
  expect(chain.advance?.sent).toBe(1);
});

test("exactly $400.00 reaches 100 USDC without the limit doing anything, and says so", async ({ page }) => {
  await connect(page, { account: true, trustline: true }, { "forepay.mock.revenue": "400.00" });
  await proveToOffer(page);
  await expect(page.getByRole("button", { name: "Accept 100.00 USDC" })).toBeVisible();
  await expect(page.getByText("A quarter of the $400.00 you earned on AdSense from July to September.")).toBeVisible();
  await expect(page.getByText("25% of $400.00 is 100.00 USDC.")).toBeVisible();
  await expect(page.getByText(/is more than 100 USDC/)).toHaveCount(0);
});

test("while the contract's sizing loads, 2a shows a placeholder, never the words for an unknown rate", async ({
  page,
}) => {
  // Record whether the neutral line ever paints.
  await page.addInitScript(() => {
    new MutationObserver(() => {
      if (document.body?.innerText.includes("A share of your proven revenue")) window.localStorage.setItem("sawNeutral", "1");
    }).observe(document, { subtree: true, childList: true, characterData: true });
  });
  await connect(page, { account: true, trustline: true, advance: { sizingDelayMs: 1500 } });
  // The box keeps its height from placeholder to line, phone and desktop alike.
  const box = page.getByRole("heading", { name: "How your advance is set" }).locator("..");
  const loading = await box.boundingBox();
  await expect(page.getByText("A quarter of your proven revenue, up to 100 USDC.")).toBeVisible();
  expect((await box.boundingBox())?.height).toBeCloseTo(loading?.height ?? 0, 0);
  expect(await page.evaluate(() => window.localStorage.getItem("sawNeutral"))).toBeNull();
});

test("without the contract's sizing, the offer leaves out the rate and limit and claims nothing on the cap", async ({
  page,
}) => {
  await connect(page, { account: true, trustline: true, advance: { sizingDown: true } }, { "forepay.mock.revenue": "1240.00" });
  await proveToOffer(page);
  await expect(page.getByRole("button", { name: "Accept 100.00 USDC" })).toBeVisible();
  await expect(page.getByText("You earned $1,240.00 on AdSense from July to September.")).toBeVisible();
  const breakdown = page.getByRole("region", { name: "How we got this number" });
  await expect(breakdown.getByText("Advance rate")).toHaveCount(0);
  await expect(breakdown.getByText("Limit per advance")).toHaveCount(0);
  await expect(page.getByText(/is more than 100 USDC/)).toHaveCount(0);
});

test("an advance under 1 USDC is refused before anything is sent, and the proof is not used", async ({ page }) => {
  const chain: Chain = { account: true, trustline: true };
  await connect(page, chain, { "forepay.mock.revenue": "3.20" });
  await page.getByRole("button", { name: "Prove my revenue" }).click();
  await expect(heading(page, "Not enough revenue yet")).toBeVisible();
  await expect(
    page.getByText("25% of $3.20 is under 1 USDC, the smallest advance we can send. Your proof was not used."),
  ).toBeVisible();
  expect(chain.advance?.sent ?? 0).toBe(0);
  await page.getByRole("button", { name: "Back" }).click();
  await expect(heading(page, "See how much you can get")).toBeVisible();
});

test("closing the Google window is named, and proving can start again", async ({ page }) => {
  await connect(page, { account: true, trustline: true }, { "forepay.mock.reclaim": "cancel" });
  await page.getByRole("button", { name: "Prove my revenue" }).click();
  await expect(heading(page, "You closed the Google window")).toBeVisible();
  await expect(page.getByText("Nothing was read or saved. Start again when you are ready.")).toBeVisible();
  await page.evaluate(() => window.localStorage.removeItem("forepay.mock.reclaim"));
  await page.getByRole("button", { name: "Prove my revenue" }).click();
  await expect(page.getByRole("button", { name: "Accept 90.00 USDC" })).toBeVisible();
});

// Refusals found while checking the proof, before any offer: each code from docs/interface.md §7.
const atCheck: { code: number; title: string; buttons: string[] }[] = [
  { code: 14, title: "We could not confirm this proof", buttons: ["Prove again", "Back"] },
  { code: 11, title: "We could not confirm this proof", buttons: ["Prove again", "Back"] },
  { code: 20, title: "This proof was already used", buttons: ["Back"] },
  { code: 12, title: "This proof expired", buttons: ["Prove again", "Back"] },
  { code: 40, title: "Advances are paused right now", buttons: ["Back"] },
  { code: 10, title: "Advances are not open yet", buttons: ["Back"] },
  { code: 13, title: "This proof is dated in the future", buttons: ["Prove again", "Back"] },
  { code: 30, title: "We could not read your revenue", buttons: ["Back"] },
];

for (const { code, title, buttons } of atCheck) {
  test(`contract code ${code} while checking the proof shows "${title}"`, async ({ page }) => {
    const chain: Chain = { account: true, trustline: true, advance: { refuse: { code, from: 1 } } };
    await connect(page, chain);
    await page.getByRole("button", { name: "Prove my revenue" }).click();
    const panel = page.getByRole("alert");
    await expect(panel.getByRole("heading", { name: title })).toBeVisible();
    for (const b of buttons) await expect(panel.getByRole("button", { name: b })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Accept / })).toHaveCount(0);
    expect(chain.advance?.sent ?? 0).toBe(0);
  });
}

test("a wallet that cannot receive USDC is asked to allow it, then gets its offer", async ({ page }) => {
  const chain: Chain = { account: true, trustline: true };
  await connect(page, chain);
  chain.trustline = false; // removed after onboarding
  await page.getByRole("button", { name: "Prove my revenue" }).click();
  await expect(heading(page, "Your wallet needs to accept USDC first")).toBeVisible();
  // No offer has been shown yet, so it does not speak of accepting one again.
  await expect(
    page.getByText("Approve USDC in your wallet, then we will show your offer. Your proof is still valid."),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Not now" })).toBeVisible();
  await page.getByRole("button", { name: "Allow USDC" }).click();
  await expect(page.getByRole("button", { name: "Accept 90.00 USDC" })).toBeVisible();
});

test("USDC no longer allowed when accepting: the board's panel, and Not now keeps the offer", async ({ page }) => {
  const chain: Chain = { account: true, trustline: true };
  await connect(page, chain);
  await proveToOffer(page);
  chain.trustline = false;
  await page.getByRole("button", { name: "Accept 90.00 USDC" }).click();
  await expect(heading(page, "Your wallet needs to accept USDC first")).toBeVisible();
  await expect(
    page.getByText("Approve USDC in your wallet, then accept the offer again. Your proof is still valid."),
  ).toBeVisible();
  expect(chain.advance?.sent ?? 0).toBe(0);
  // The proof was not used, as the panel says: back to the same offer, not to a new Reclaim session.
  await page.getByRole("button", { name: "Not now" }).click();
  await expect(page.getByRole("button", { name: "Accept 90.00 USDC" })).toBeVisible();
});

test("Open the window again keeps waiting for the AdSense login, then goes on", async ({ page }) => {
  await connect(page, { account: true, trustline: true });
  await page.getByRole("button", { name: "Prove my revenue" }).click();
  await page.getByRole("button", { name: "Open the window again" }).click();
  await expect(heading(page, "Sign in with Google in the new window")).toBeVisible();
  await expect(page.getByRole("button", { name: "Accept 90.00 USDC" })).toBeVisible();
});

test("Stellar not answering at accept is named, and Back keeps the offer", async ({ page }) => {
  const chain: Chain = { account: true, trustline: true };
  await connect(page, chain);
  await proveToOffer(page);
  chain.down = true;
  await page.getByRole("button", { name: "Accept 90.00 USDC" }).click();
  await expect(heading(page, "We could not reach Stellar")).toBeVisible();
  chain.down = false;
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByRole("button", { name: "Accept 90.00 USDC" })).toBeVisible();
});

test("a request Stellar cannot run, with no contract code, has its own words", async ({ page }) => {
  await connect(page, { account: true, trustline: true, advance: { simulationFails: true } });
  await page.getByRole("button", { name: "Prove my revenue" }).click();
  await expect(heading(page, "Stellar could not run this request")).toBeVisible();
  await expect(heading(page, "We could not reach Stellar")).toHaveCount(0);
});

test("a proof that expires while the offer is open is named at accept, and Prove again restarts", async ({ page }) => {
  const chain: Chain = { account: true, trustline: true, advance: { refuse: { code: 12, from: 2 } } };
  await connect(page, chain);
  await proveToOffer(page);
  await page.getByRole("button", { name: "Accept 90.00 USDC" }).click();
  await expect(heading(page, "This proof expired")).toBeVisible();
  await expect(heading(page, "Approve the advance")).toBeVisible();
  expect(chain.advance?.sent ?? 0).toBe(0);
  await page.getByRole("button", { name: "Prove again" }).click();
  await expect(heading(page, "Sign in with Google in the new window")).toBeVisible();
});

test("a proof already used, found at accept, is named, and Back leaves the offer behind", async ({ page }) => {
  await connect(page, { account: true, trustline: true, advance: { refuse: { code: 20, from: 2 } } });
  await proveToOffer(page);
  await page.getByRole("button", { name: "Accept 90.00 USDC" }).click();
  await expect(heading(page, "This proof was already used")).toBeVisible();
  await page.getByRole("button", { name: "Back" }).click();
  await expect(heading(page, "See how much you can get")).toBeVisible();
});

test("liquidity running out between offer and accept pauses advances", async ({ page }) => {
  await connect(page, { account: true, trustline: true, advance: { refuse: { code: 40, from: 2 } } });
  await proveToOffer(page);
  await page.getByRole("button", { name: "Accept 90.00 USDC" }).click();
  await expect(heading(page, "Advances are paused right now")).toBeVisible();
  await expect(
    page.getByText("There is not enough USDC in Forepay to send this advance. Your proof was not used. Try again later."),
  ).toBeVisible();
});

test("declining in the wallet sends nothing and keeps the offer", async ({ page }) => {
  const chain: Chain = { account: true, trustline: true };
  await connect(page, chain);
  await proveToOffer(page);
  await page.evaluate(() => window.localStorage.setItem("forepay.e2e.scenario", "decline-sign"));
  await page.getByRole("button", { name: "Accept 90.00 USDC" }).click();
  await expect(heading(page, "You declined in Freighter")).toBeVisible();
  await expect(page.getByText("Nothing was sent. Your offer is still here for the next hour.")).toBeVisible();
  expect(chain.advance?.sent ?? 0).toBe(0);
  await page.getByRole("button", { name: "Review offer again" }).click();
  await expect(page.getByRole("button", { name: "Accept 90.00 USDC" })).toBeVisible();
});

test("Cancel on 2c goes back to the offer, and nothing is sent", async ({ page }) => {
  const chain: Chain = { account: true, trustline: true, advance: { acceptDelayMs: 1500 } };
  await connect(page, chain);
  await proveToOffer(page);
  await page.getByRole("button", { name: "Accept 90.00 USDC" }).click();
  await expect(heading(page, "Approve in Freighter")).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("button", { name: "Accept 90.00 USDC" })).toBeVisible();
  // The wallet still answers after Cancel. Its signature must never reach the network.
  await page.waitForTimeout(2500);
  expect(chain.advance?.sent ?? 0).toBe(0);
  await expect(heading(page, "Your offer")).toBeVisible();
});

test("a transaction the network refuses says nothing was charged, and Try again sends it", async ({ page }) => {
  const chain: Chain = { account: true, trustline: true, advance: { send: "refused" } };
  await connect(page, chain);
  await proveToOffer(page);
  await page.getByRole("button", { name: "Accept 90.00 USDC" }).click();
  await expect(heading(page, "The transaction did not go through")).toBeVisible();
  await expect(page.getByText("Nothing was charged and no USDC moved. Try again in a moment.")).toBeVisible();
  chain.advance!.send = "ok";
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(heading(page, "The USDC is in your wallet")).toBeVisible();
  expect(chain.advance?.sent).toBe(2);
});

test("a transaction that fails on the ledger does not claim nothing was charged", async ({ page }) => {
  await connect(page, { account: true, trustline: true, advance: { send: "failed" } });
  await proveToOffer(page);
  await page.getByRole("button", { name: "Accept 90.00 USDC" }).click();
  await expect(heading(page, "The transaction did not go through")).toBeVisible();
  await expect(page.getByText("Stellar kept the tiny network fee, but no USDC moved. Try again in a moment.")).toBeVisible();
  // A ledger failure is usually the contract refusing there, so Back does not trust the old offer.
  await page.getByRole("button", { name: "Back" }).click();
  await expect(heading(page, "See how much you can get")).toBeVisible();
});

test("a slow confirmation says so after 30 seconds, and times out after two minutes", async ({ page }) => {
  test.setTimeout(90_000);
  await page.clock.install();
  await connect(page, { account: true, trustline: true, advance: { send: "pending" } });
  await proveToOffer(page);
  await page.getByRole("button", { name: "Accept 90.00 USDC" }).click();
  await expect(heading(page, "Sending your USDC")).toBeVisible();

  // One poll a second: step the clock a second at a time so each poll's request can answer.
  const tick = async (seconds: number) => {
    for (let i = 0; i < seconds; i++) {
      await page.clock.fastForward(1000);
      await page.waitForTimeout(15);
    }
  };
  await tick(31);
  await expect(heading(page, "Still waiting for Stellar")).toBeVisible();
  await tick(95);
  await expect(heading(page, "This took too long")).toBeVisible();
  await expect(
    page.getByText("We stopped waiting. Check History before you try again. The same proof can never pay out twice."),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Open History" })).toHaveAttribute("href", "/history");
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
});

test("Stellar not answering while the proof is checked is named, and Try again checks again", async ({ page }) => {
  const chain: Chain = { account: true, trustline: true };
  await connect(page, chain);
  chain.down = true;
  await page.getByRole("button", { name: "Prove my revenue" }).click();
  await expect(heading(page, "We could not reach Stellar")).toBeVisible();
  chain.down = false;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("button", { name: "Accept 90.00 USDC" })).toBeVisible();
});

test("Not now on the offer goes back to 2a", async ({ page }) => {
  await connect(page, { account: true, trustline: true });
  await proveToOffer(page);
  await page.getByRole("button", { name: "Not now" }).click();
  await expect(heading(page, "See how much you can get")).toBeVisible();
});
