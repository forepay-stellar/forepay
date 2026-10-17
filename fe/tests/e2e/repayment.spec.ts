import { expect, test, type Page } from "@playwright/test";
import { E2E_ADDRESS } from "../../src/lib/stellar/wallet-e2e";
import { ADVANCE_TX, frameLedger, mockApi, recordRepayment, type Ledger } from "./api";
import { mockRpc, type Chain } from "./rpc";

// #21: 3a Repayment and 3b All transactions, with the test wallet, the stubbed RPC and the stubbed #16
// API. Every figure on screen must come from the API answer, so after a repayment lands the spec changes
// only the API's ledger, and the screen has to read it again to show it.

const USDC = 10_000_000n;
const APPROVE = /Confirm in your wallet|Approve in Freighter/;

/** Start with a wallet that is already connected, as a returning creator would. */
async function open(page: Page, path: string, ledger: Ledger, chain: Partial<Chain> = {}) {
  const fullChain: Chain = { account: true, trustline: true, usdc: 820n * USDC, ...chain };
  fullChain.contract ??= {};
  fullChain.contract.onRepaid ??= (amount, hash) => recordRepayment(ledger, amount, hash);
  await mockApi(page, ledger);
  await mockRpc(page, fullChain);
  await page.addInitScript((address) => {
    localStorage.setItem("forepay.wallet", address);
    localStorage.setItem("forepay.wallet.name", "Freighter");
    localStorage.setItem("forepay.e2e.connected", "1");
  }, E2E_ADDRESS);
  await page.goto(path);
  return fullChain;
}

const card = (page: Page) => page.getByRole("region", { name: "What is left to repay" });
const form = (page: Page) => page.getByRole("form", { name: "Make a repayment" });
const amount = (page: Page) => page.getByLabel("Amount", { exact: true });

test("a partial repayment and then a full one, each read back from the API", async ({ page }) => {
  const ledger = frameLedger();
  let release!: () => void;
  const chain = await open(page, "/repayment", ledger, {
    contract: { hold: new Promise<void>((r) => (release = r)) },
  });

  await expect(card(page)).toContainText("60.00");
  await expect(card(page)).toContainText("30.00 of 90.00 USDC repaid");
  await expect(card(page)).toContainText("33%");
  await expect(form(page)).toContainText("820.00 USDC");

  // Partial: 50% of what is left.
  await page.getByRole("button", { name: "50%" }).click();
  await expect(page.getByRole("button", { name: "50%" })).toHaveAttribute("aria-pressed", "true");
  await expect(amount(page)).toHaveValue("30.00");
  await expect(form(page).getByText("Left after this").locator("..")).toContainText("30.00 USDC");
  await page.getByRole("button", { name: "Repay 30.00 USDC" }).click();

  // Signed at once by the test wallet, then sent: it waits for Stellar as a pending row.
  const transactions = page.getByRole("region", { name: "Transactions" });
  await expect(transactions.getByText("Pending")).toBeVisible();
  await expect(transactions.getByText("Just now")).toBeVisible();
  await expect(page.getByRole("button", { name: "Waiting for Stellar" })).toBeDisabled();
  // Nothing on screen moves before the ledger answers.
  await expect(card(page)).toContainText("60.00");

  release();
  await expect(page.getByText("30.00 USDC repaid", { exact: true })).toBeVisible();
  await expect(card(page)).toContainText("60.00 of 90.00 USDC repaid");
  await expect(card(page)).toContainText("66%");
  await expect(transactions.getByText("Pending")).toHaveCount(0);
  await expect(transactions.getByText("Today")).toBeVisible();
  await expect(amount(page)).toHaveValue("");
  await expect(form(page)).toContainText("790.00 USDC");
  expect(chain.contract?.sent?.map((c) => [c.method, c.args[2]])).toEqual([["repay", 30n * USDC]]);

  // Full: everything that is left, from the quick action.
  await page.getByRole("button", { name: /Pay in full|Pay all/ }).click();
  await expect(amount(page)).toHaveValue("30.00");
  await expect(page.getByRole("button", { name: "Full amount" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Repay 30.00 USDC" }).click();

  await expect(card(page)).toContainText("Nothing left to repay");
  await expect(card(page)).toContainText("Repaid");
  await expect(card(page)).toContainText("90.00 of 90.00 USDC repaid");
  await expect(card(page)).toContainText("100%");
  await expect(page.getByRole("button", { name: "Nothing left to repay" })).toBeDisabled();
  await expect(amount(page)).toBeDisabled();
  await expect(page.getByRole("button", { name: "Repay", exact: true })).toBeDisabled();
  expect(ledger.advances[0].repaid).toBe(90n * USDC);
});

test("a declined signature charges nothing and leaves the balance alone", async ({ page }) => {
  await open(page, "/repayment", frameLedger());
  await page.evaluate(() => localStorage.setItem("forepay.e2e.scenario", "decline-sign"));
  await page.getByRole("button", { name: "25%" }).click();
  await page.getByRole("button", { name: "Repay 15.00 USDC" }).click();
  await expect(form(page).getByRole("alert")).toContainText("You declined the repayment");
  await expect(form(page).getByRole("alert")).toContainText("Nothing was charged");
  await expect(card(page)).toContainText("60.00");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("the wallet window repeats the amount, and a repayment approved after Cancel still lands", async ({ page }) => {
  const ledger = frameLedger();
  await open(page, "/repayment", ledger);
  await page.evaluate(() => localStorage.setItem("forepay.e2e.scenario", "hold-sign"));
  await page.getByRole("button", { name: "50%" }).click();
  await page.getByRole("button", { name: "Repay 30.00 USDC" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: APPROVE })).toBeVisible();
  await expect(dialog).toContainText("You repay");
  await expect(dialog).toContainText("30.00 USDC");
  await expect(dialog.getByText("Left after this").locator("..")).toContainText("30.00 USDC");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // The wallet window is still open, so nothing else can be sent meanwhile.
  await expect(page.getByRole("button", { name: "Waiting for your wallet" })).toBeDisabled();
  await expect(amount(page)).toBeDisabled();
  await expect(form(page).getByRole("alert")).toHaveCount(0);

  // The creator approves it in the wallet after all: it is followed to the end.
  await page.evaluate(() => localStorage.removeItem("forepay.e2e.scenario"));
  await expect(page.getByText("30.00 USDC repaid", { exact: true })).toBeVisible();
  await expect(card(page)).toContainText("60.00 of 90.00 USDC repaid");
  expect(ledger.advances[0].repaid).toBe(60n * USDC);
});

test("a repayment turned down after Cancel goes quietly back to the form", async ({ page }) => {
  await open(page, "/repayment", frameLedger());
  await page.evaluate(() => localStorage.setItem("forepay.e2e.scenario", "hold-sign"));
  await page.getByRole("button", { name: "25%" }).click();
  await page.getByRole("button", { name: "Repay 15.00 USDC" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
  await page.evaluate(() => localStorage.setItem("forepay.e2e.scenario", "decline-sign"));
  await expect(page.getByRole("button", { name: "Repay 15.00 USDC" })).toBeEnabled();
  await expect(form(page).getByRole("alert")).toHaveCount(0);
  await expect(card(page)).toContainText("60.00");
});

test("more than is left is stopped in the form, before the contract", async ({ page }) => {
  const chain = await open(page, "/repayment", frameLedger());
  await amount(page).fill("75");
  await expect(form(page)).toContainText("Only 60.00 USDC left");
  await expect(amount(page)).toHaveAttribute("aria-invalid", "true");
  expect(chain.contract?.sent ?? []).toEqual([]);

  // The offer acts: it fills what is left, and nothing is sent until the creator repays that (S7).
  await page.getByRole("button", { name: "Repay 60.00 USDC instead" }).click();
  await expect(amount(page)).toHaveValue("60.00");
  await expect(page.getByRole("button", { name: "Full amount" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Repay 60.00 USDC" })).toBeEnabled();
  expect(chain.contract?.sent ?? []).toEqual([]);
});

test("more than the wallet holds is stopped in the form", async ({ page }) => {
  await open(page, "/repayment", frameLedger(), { usdc: 12n * USDC });
  await expect(form(page)).toContainText("12.00 USDC");
  await page.getByRole("button", { name: "Full amount" }).click();
  await expect(form(page)).toContainText("Not enough USDC in wallet");
  await expect(page.getByRole("button", { name: "Add USDC to your wallet" })).toBeDisabled();
});

test("only digits and one decimal point reach the amount field", async ({ page }) => {
  await open(page, "/repayment", frameLedger());
  await amount(page).pressSequentially("1a2.5x0");
  await expect(amount(page)).toHaveValue("12.50");
  await expect(page.getByRole("button", { name: "Repay 12.50 USDC" })).toBeEnabled();
  await amount(page).fill("");
  await expect(page.getByRole("button", { name: "Enter an amount" })).toBeDisabled();
});

const failures: { name: string; contract: NonNullable<Chain["contract"]>; title: string; body: RegExp }[] = [
  {
    // The USDC token contract's own BalanceError, raised inside repay when the wallet is short.
    name: "the wallet is short of USDC",
    contract: { refuse: 10 },
    title: "Your wallet does not hold enough USDC",
    body: /Nothing was charged/,
  },
  {
    name: "the contract refuses it",
    contract: { refuse: 51 },
    title: "That is more than you owe",
    body: /Enter an amount up to what is still outstanding/,
  },
  {
    name: "the network does not take it",
    contract: { send: "refused" },
    title: "The repayment did not go through",
    body: /Nothing was charged/,
  },
  {
    name: "it fails on the ledger",
    contract: { send: "failed" },
    title: "The repayment did not go through",
    body: /kept the tiny network fee/,
  },
];

for (const f of failures) {
  test(`a repayment that does not land says why: ${f.name}`, async ({ page }) => {
    const ledger = frameLedger();
    await open(page, "/repayment", ledger, { contract: f.contract });
    await page.getByRole("button", { name: "50%" }).click();
    await page.getByRole("button", { name: "Repay 30.00 USDC" }).click();
    const alert = form(page).getByRole("alert");
    await expect(alert).toContainText(f.title);
    await expect(alert).toContainText(f.body);
    await expect(card(page)).toContainText("60.00");
    await expect(page.getByText("30.00 USDC repaid", { exact: true })).toHaveCount(0);
    expect(ledger.advances[0].repaid).toBe(30n * USDC);
  });
}

test("a fully repaid advance turns the card quiet and the form off", async ({ page }) => {
  const ledger = frameLedger();
  ledger.advances[0].repaid = 90n * USDC;
  await open(page, "/repayment", ledger);
  await expect(card(page)).toContainText("Nothing left to repay");
  await expect(card(page)).toContainText("100%");
  await expect(page.getByRole("button", { name: "Nothing left to repay" })).toBeDisabled();
  for (const name of ["25%", "50%", "Full amount", "Max"]) {
    await expect(page.getByRole("button", { name, exact: true })).toBeDisabled();
  }
});

test("no advance yet points to the Advance tab", async ({ page }) => {
  await open(page, "/repayment", { advances: [], transactions: [] });
  await expect(page.getByRole("heading", { name: "No advance yet" })).toBeVisible();
  await page.getByRole("button", { name: "Get an advance" }).click();
  await expect(page).toHaveURL(/\/advance$/);
});

test("loading shows shapes, never a number, and only after a moment", async ({ page }) => {
  const ledger = frameLedger();
  ledger.delayMs = 1500;
  await open(page, "/repayment", ledger);
  const loading = page.getByRole("status", { name: "Reading your balance from Stellar" });
  await expect(loading).toBeAttached();
  await expect(page.getByText("60.00")).toHaveCount(0);
  await expect(card(page)).toContainText("60.00");
  await expect(loading).toHaveCount(0);
});

test("an API that does not answer shows no figures, and Try again reads them", async ({ page }) => {
  const ledger = frameLedger();
  ledger.down = true;
  await open(page, "/repayment", ledger);
  await expect(page.getByRole("heading", { name: "We cannot read your balance right now" })).toBeVisible();
  await expect(page.getByText("60.00")).toHaveCount(0);
  ledger.down = false;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(card(page)).toContainText("60.00");
});

test("a read that fails after figures were shown does not keep the old figures", async ({ page }) => {
  const ledger = frameLedger();
  await open(page, "/repayment", ledger);
  await expect(card(page)).toContainText("60.00");
  ledger.down = true;
  // Leaving and coming back to the tab refetches.
  await page.evaluate(() => window.dispatchEvent(new Event("visibilitychange")));
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByRole("heading", { name: "We cannot read your balance right now" })).toBeVisible();
  await expect(page.getByText("60.00")).toHaveCount(0);
});

test("every completed row opens its receipt on stellar.expert, a failed row has none", async ({ page }) => {
  await open(page, "/repayment", frameLedger());
  const rows = page.getByRole("region", { name: "Transactions" }).getByRole("listitem");
  await expect(rows).toHaveCount(4);
  const advance = rows.nth(0).getByRole("link");
  await expect(advance).toHaveAttribute("href", `https://stellar.expert/explorer/testnet/tx/${ADVANCE_TX}`);
  await expect(advance).toHaveAttribute("target", "_blank");
  await expect(rows.nth(0)).toContainText("+90.00 USDC");
  await expect(rows.nth(2)).toContainText(/Failed, not charged|Not charged/);
  await expect(rows.nth(2).getByRole("link")).toHaveCount(0);
});

test("See all opens every transaction, by month, with the proof and the USDC allowance", async ({ page }) => {
  await open(page, "/repayment", frameLedger());
  await page.getByRole("link", { name: "See all" }).click();
  await expect(page).toHaveURL(/\/history$/);
  await expect(page.getByRole("heading", { name: "History", level: 1 })).toBeVisible();
  const month = page.getByRole("region", { name: "October 2026" });
  const rows = month.getByRole("listitem");
  await expect(rows).toHaveCount(6);
  await expect(rows.nth(0)).toContainText("10.00 USDC");
  await expect(rows.nth(3)).toContainText("Advance received");
  await expect(rows.nth(4)).toContainText(/Revenue proof verified|Proof verified/);
  await expect(rows.nth(4)).toContainText("$360.00");
  await expect(rows.nth(5)).toContainText(/USDC allowed/);
  await expect(page.getByText("Left to repay")).toBeVisible();
});

test("History reads the same figures and fails the same way", async ({ page }) => {
  const ledger = frameLedger();
  ledger.down = true;
  await open(page, "/history", ledger);
  await expect(page.getByRole("heading", { name: "We cannot read your balance right now" })).toBeVisible();
  ledger.down = false;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("region", { name: "October 2026" }).getByRole("listitem")).toHaveCount(6);
});

test("a failed read while a repayment is out keeps it pending and the form held (B1)", async ({ page }) => {
  const ledger = frameLedger();
  const chain = await open(page, "/repayment", ledger, { contract: { holdLedger: true } });
  await page.getByRole("button", { name: "50%" }).click();
  await page.getByRole("button", { name: "Repay 30.00 USDC" }).click();
  const transactions = page.getByRole("region", { name: "Transactions" });
  await expect(transactions.getByText("Pending")).toBeVisible();

  // The wallet window closes, the page refocuses, and the API fails that read.
  ledger.down = true;
  await page.evaluate(() => window.dispatchEvent(new Event("visibilitychange")));
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();

  // Back to a good read: the repayment is still pending and the form still held.
  ledger.down = false;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(transactions.getByText("Pending")).toBeVisible();
  await expect(page.getByRole("button", { name: "Waiting for Stellar" })).toBeDisabled();

  chain.contract!.holdLedger = false;
  await expect(card(page)).toContainText("60.00 of 90.00 USDC repaid");
  await expect(transactions.getByText("Pending")).toHaveCount(0);
  expect(chain.contract?.sent).toHaveLength(1);
});

test("a repayment the API has not indexed yet stays pending until it has (B2)", async ({ page }) => {
  const ledger = frameLedger();
  // The indexer behind #16 is a few seconds behind the ledger.
  let index!: () => void;
  const chain = await open(page, "/repayment", ledger, {
    contract: {
      onRepaid: (amount, hash) => {
        index = () => recordRepayment(ledger, amount, hash);
      },
    },
  });
  await page.getByRole("button", { name: "50%" }).click();
  await page.getByRole("button", { name: "Repay 30.00 USDC" }).click();
  await expect(page.getByText("30.00 USDC repaid", { exact: true })).toBeVisible();

  // Landed on the ledger, not yet in the API: the row stays pending, the form held, the card as it was.
  const transactions = page.getByRole("region", { name: "Transactions" });
  await expect(transactions.getByText("Pending")).toBeVisible();
  await expect(page.getByRole("button", { name: "Waiting for Stellar" })).toBeDisabled();
  await expect(card(page)).toContainText("30.00 of 90.00 USDC repaid");

  // The indexer catches up, and the screen reads it without being asked.
  index();
  await expect(card(page)).toContainText("60.00 of 90.00 USDC repaid");
  await expect(transactions.getByText("Pending")).toHaveCount(0);
  expect(chain.contract?.sent).toHaveLength(1);
});

test("a repayment not confirmed in two minutes stays held and watched, then lands (B3)", async ({ page }) => {
  test.setTimeout(90_000);
  await page.clock.install();
  const ledger = frameLedger();
  const chain = await open(page, "/repayment", ledger, { contract: { holdLedger: true } });
  await page.getByRole("button", { name: "50%" }).click();
  await page.getByRole("button", { name: "Repay 30.00 USDC" }).click();
  const transactions = page.getByRole("region", { name: "Transactions" });
  await expect(transactions.getByText("Pending")).toBeVisible();

  const tick = async (seconds: number) => {
    for (let i = 0; i < seconds; i++) {
      await page.clock.fastForward(1000);
      await page.waitForTimeout(15);
    }
  };
  await tick(125);
  await expect(form(page).getByRole("alert")).toContainText("not confirmed yet");
  // Not unlocked: nothing invites paying again while it may still land.
  await expect(transactions.getByText("Pending")).toBeVisible();
  await expect(page.getByRole("button", { name: "Waiting for Stellar" })).toBeDisabled();

  chain.contract!.holdLedger = false;
  await tick(10);
  await expect(card(page)).toContainText("60.00 of 90.00 USDC repaid");
  // Landed after all: "not confirmed yet" no longer stands.
  await expect(form(page).getByRole("alert")).toHaveCount(0);
  await expect(transactions.getByText("Pending")).toHaveCount(0);
  expect(chain.contract?.sent).toHaveLength(1);
});

test("an amount with more than two decimals is shown as it is sent, everywhere (S4)", async ({ page }) => {
  const ledger = frameLedger();
  const chain = await open(page, "/repayment", ledger, { contract: { holdLedger: true } });
  await amount(page).fill("12.509");
  await expect(form(page).getByText("Left after this").locator("..")).toContainText("47.491 USDC");
  await page.getByRole("button", { name: "Repay 12.509 USDC" }).click();
  const transactions = page.getByRole("region", { name: "Transactions" });
  await expect(transactions.getByText("−12.509 USDC")).toBeVisible();
  chain.contract!.holdLedger = false;
  await expect(page.getByText("12.509 USDC repaid", { exact: true })).toBeVisible();
  // The card and the row read back from the API carry the same decimals.
  await expect(card(page)).toContainText("47.491");
  await expect(card(page)).toContainText("42.509 of 90.00 USDC repaid");
  await expect(transactions.getByText("−12.509 USDC")).toBeVisible();
  expect(chain.contract?.sent?.map((c) => c.args[2])).toEqual([125_090_000n]);
});

/** One poll a second: step the clock a second at a time so each poll's request can answer. */
async function tick(page: Page, seconds: number) {
  for (let i = 0; i < seconds; i++) {
    await page.clock.fastForward(1000);
    await page.waitForTimeout(15);
  }
}

test("a repayment that never reached Stellar is let go once it is past its time limit", async ({ page }) => {
  test.setTimeout(120_000);
  await page.clock.install();
  const ledger = frameLedger();
  const chain = await open(page, "/repayment", ledger, { contract: { dropSend: true } });
  await page.getByRole("button", { name: "50%" }).click();
  await page.getByRole("button", { name: "Repay 30.00 USDC" }).click();
  // No answer to the send: it may be out, so it is held and watched at first.
  await expect(form(page).getByRole("alert")).toContainText("not confirmed yet");
  await expect(page.getByRole("button", { name: "Waiting for Stellar" })).toBeDisabled();

  // Built with a 180 s limit. The ledger's clock, not the browser's, says when that has passed: once a
  // "not found" comes from a ledger closed after it, none ever will have it.
  chain.ledgerAheadS = 600;
  await tick(page, 260);
  await expect(form(page).getByRole("alert")).toContainText("The repayment did not go through");
  await expect(form(page).getByRole("alert")).toContainText("Nothing was charged");
  const transactions = page.getByRole("region", { name: "Transactions" });
  await expect(transactions.getByText("Pending")).toHaveCount(0);
  await page.getByRole("button", { name: "50%" }).click();
  await expect(page.getByRole("button", { name: "Repay 30.00 USDC" })).toBeEnabled();
  expect(await page.evaluate(() => sessionStorage.getItem("forepay.repayment.inflight"))).toBeNull();
  expect(chain.contract?.sent ?? []).toEqual([]);
});

test("an API that never reports a landed repayment lets the form go after two minutes", async ({ page }) => {
  test.setTimeout(120_000);
  await page.clock.install();
  const ledger = frameLedger();
  // The indexer behind #16 never records it.
  await open(page, "/repayment", ledger, { contract: { onRepaid: () => {} } });
  await page.getByRole("button", { name: "50%" }).click();
  await page.getByRole("button", { name: "Repay 30.00 USDC" }).click();
  await tick(page, 3);
  await expect(page.getByText("30.00 USDC repaid", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Waiting for Stellar" })).toBeDisabled();

  await tick(page, 125);
  // The row stays pending, the form opens again, and a note says why the figures have not moved.
  const transactions = page.getByRole("region", { name: "Transactions" });
  await expect(transactions.getByText("Pending")).toBeVisible();
  await expect(form(page).getByRole("status")).toContainText("Your repayment is confirmed on Stellar");
  await page.getByRole("button", { name: "25%" }).click();
  await expect(page.getByRole("button", { name: "Repay 15.00 USDC" })).toBeEnabled();
});

test("a repayment being sent is waited on once, not by the screen and the page both", async ({ page }) => {
  const ledger = frameLedger();
  await open(page, "/repayment", ledger, { contract: { holdLedger: true } });
  let polls = 0;
  page.on("request", (r) => {
    if (r.url().includes("rpc.e2e.invalid") && (r.postDataJSON() as { method: string }).method === "getTransaction") polls++;
  });
  await page.getByRole("button", { name: "50%" }).click();
  await page.getByRole("button", { name: "Repay 30.00 USDC" }).click();
  await expect(page.getByRole("region", { name: "Transactions" }).getByText("Pending")).toBeVisible();
  const start = polls;
  await page.waitForTimeout(8000);
  // About one a second from one waiter (about 8); two would make it about 14.
  expect(polls - start).toBeLessThanOrEqual(10);
});

test("a repayment the network took is never called uncharged while Stellar does not answer", async ({ page }) => {
  test.setTimeout(120_000);
  await page.clock.install();
  const ledger = frameLedger();
  const chain = await open(page, "/repayment", ledger, { contract: { holdLedger: true } });
  await page.getByRole("button", { name: "50%" }).click();
  await page.getByRole("button", { name: "Repay 30.00 USDC" }).click();
  const transactions = page.getByRole("region", { name: "Transactions" });
  await expect(transactions.getByText("Pending")).toBeVisible();

  // The network has it; then the node stops answering, well past the transaction's time limit.
  chain.contract!.dropPolls = true;
  await tick(page, 400);
  await expect(form(page).getByRole("alert")).toContainText("We could not reach Stellar");
  await expect(page.getByText("Nothing was charged")).toHaveCount(0);
  await expect(transactions.getByText("Pending")).toBeVisible();
  await expect(page.getByRole("button", { name: "Waiting for Stellar" })).toBeDisabled();

  // The node is back, and the repayment had landed.
  chain.contract!.dropPolls = false;
  chain.contract!.holdLedger = false;
  await tick(page, 10);
  await expect(card(page)).toContainText("60.00 of 90.00 USDC repaid");
  await expect(form(page).getByRole("alert")).toHaveCount(0);
  expect(chain.contract?.sent).toHaveLength(1);
});
