import { expect, test } from "@playwright/test";
import { mockRpc } from "./rpc";

// #20: the AppShell around every screen after onboarding. Desktop has the segmented tabs in the top nav,
// a phone has the tab bar pinned to the bottom. Either way, one "Main" navigation is visible.

test("the tabs move between Advance, Repayment and History and mark the current one", async ({ page }) => {
  await mockRpc(page, { account: true, trustline: true });
  await page.goto("/start");
  await page.getByRole("button", { name: "Get started" }).click();
  await page.getByRole("button", { name: "Connect wallet" }).click();
  // The picker opens in its dialog; the test wallet is its first row.
  await page.getByRole("dialog", { name: "Connect wallet" }).getByRole("button").first().click();
  await expect(page).toHaveURL(/\/advance$/);

  const nav = page.getByRole("navigation", { name: "Main" });
  await expect(nav).toHaveCount(1);
  await expect(nav.getByRole("link", { name: "Advance" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("banner").getByText("Testnet")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Wallet / })).toBeVisible();

  await nav.getByRole("link", { name: "Repayment" }).click();
  await expect(page).toHaveURL(/\/repayment$/);
  await expect(nav.getByRole("link", { name: "Repayment" })).toHaveAttribute("aria-current", "page");
  await expect(nav.getByRole("link", { name: "Advance" })).not.toHaveAttribute("aria-current", "page");

  await nav.getByRole("link", { name: "History" }).click();
  await expect(page).toHaveURL(/\/history$/);
  await expect(nav.getByRole("link", { name: "History" })).toHaveAttribute("aria-current", "page");
});
