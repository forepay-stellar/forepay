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

test("the wallet window repeats the amount, and Cancel goes back to the form", async ({ page }) => {
  await open(page, "/repayment", frameLedger());
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
  await expect(page.getByRole("button", { name: "Repay 30.00 USDC" })).toBeEnabled();
  await expect(form(page).getByRole("alert")).toHaveCount(0);
  await expect(card(page)).toContainText("60.00");
});

test("more than is left is stopped in the form, before the contract", async ({ page }) => {
  const chain = await open(page, "/repayment", frameLedger());
  await amount(page).fill("75");
  await expect(form(page)).toContainText("Only 60.00 USDC left");
  await expect(page.getByRole("button", { name: "Repay 60.00 USDC instead" })).toBeDisabled();
  await expect(amount(page)).toHaveAttribute("aria-invalid", "true");
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
