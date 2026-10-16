import { friendbotUrl } from "./network";
import { readUsdcStatus } from "./trustline";

/** Friendbot did not fund the account, and the ledger confirms it is still unfunded. */
export class FriendbotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FriendbotError";
  }
}

/**
 * Fund a new testnet account with XLM from Friendbot, then wait until the ledger shows it, so the next
 * read does not still say "unfunded" a ledger too early.
 *
 * Friendbot's error answers are not a contract worth parsing (an account that already exists comes
 * back as a generic server error), so a refusal is checked against the ledger instead: if the account
 * exists anyway, that is the outcome we wanted. Throws `FriendbotError` when the faucet did not fund
 * it, and lets a ledger read failure through as itself, so the two get different messages.
 */
export async function fundWithFriendbot(address: string, { attempts = 10, intervalMs = 1000 } = {}): Promise<void> {
  let res: Response;
  try {
    res = await fetch(friendbotUrl(address));
  } catch {
    throw new FriendbotError("Friendbot did not answer");
  }
  if (!res.ok) {
    if ((await readUsdcStatus(address)) !== "unfunded") return;
    throw new FriendbotError(`Friendbot answered ${res.status}`);
  }
  for (let i = 0; i < attempts; i++) {
    if ((await readUsdcStatus(address)) !== "unfunded") return;
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new FriendbotError("The funded account did not appear on the ledger");
}
