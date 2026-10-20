import type { Page, Route } from "@playwright/test";
import { Asset, xdr } from "@stellar/stellar-sdk";

/**
 * A stand-in for Stellar RPC. The app under test points at https://rpc.e2e.invalid (see
 * playwright.config.ts); this answers its JSON-RPC calls with ledger entries built here, so each spec
 * decides what the chain says.
 */
export const USDC = new Asset("USDC", "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5");

export type Chain = {
  /** Does the account exist (has it been funded with XLM)? */
  account: boolean;
  /** Does it hold a USDC trustline? Flips to true once a changeTrust is "submitted". */
  trustline: boolean;
  /** Answer every call with a server error instead. */
  down?: boolean;
  /** How a submitted changeTrust ends: lands (default), refused before the ledger, or failed on it. */
  send?: "ok" | "refused" | "failed";
};

function accountEntry(accountId: xdr.AccountId) {
  return xdr.LedgerEntryData.account(
    new xdr.AccountEntry({
      accountId,
      balance: xdr.Int64.fromString("100000000"),
      seqNum: xdr.Int64.fromString("1"),
      numSubEntries: 0,
      inflationDest: null,
      flags: 0,
      homeDomain: "",
      thresholds: Buffer.from([1, 0, 0, 0]),
      signers: [],
      ext: new xdr.AccountEntryExt(0),
    }),
  );
}

function trustlineEntry(accountId: xdr.AccountId) {
  return xdr.LedgerEntryData.trustline(
    new xdr.TrustLineEntry({
      accountId,
      asset: USDC.toTrustLineXDRObject(),
      balance: xdr.Int64.fromString("0"),
      limit: xdr.Int64.fromString("9223372036854775807"),
      flags: 1,
      ext: new xdr.TrustLineEntryExt(0),
    }),
  );
}

/** A successful one-operation result and an empty v0 meta: enough for the SDK to parse a SUCCESS. */
function successResult() {
  const opResult = xdr.OperationResult.opInner(
    xdr.OperationResultTr.changeTrust(xdr.ChangeTrustResult.changeTrustSuccess()),
  );
  return new xdr.TransactionResult({
    feeCharged: xdr.Int64.fromString("100"),
    result: xdr.TransactionResultResult.txSuccess([opResult]),
    ext: new xdr.TransactionResultExt(0),
  }).toXDR("base64");
}

export async function mockRpc(page: Page, chain: Chain) {
  let envelope = "";
  // Friendbot funds the account, as the real one does.
  await page.route("https://friendbot.stellar.org/**", (route) => {
    chain.account = true;
    return route.fulfill({ contentType: "application/json", body: "{}" });
  });
  await page.route("https://rpc.e2e.invalid/**", async (route: Route) => {
    if (chain.down) return route.fulfill({ status: 503, body: "unavailable" });
    const body = route.request().postDataJSON() as { id: number; method: string; params: Record<string, unknown> };
    const reply = (result: unknown) =>
      route.fulfill({ contentType: "application/json", body: JSON.stringify({ jsonrpc: "2.0", id: body.id, result }) });

    switch (body.method) {
      case "getLedgerEntries": {
        const keys = (body.params.keys as string[]).map((k) => xdr.LedgerKey.fromXDR(k, "base64"));
        const entries = [];
        for (const key of keys) {
          const type = key.switch();
          if (type === xdr.LedgerEntryType.account() && chain.account) {
            const data = accountEntry(key.account().accountId());
            entries.push({ key: key.toXDR("base64"), xdr: data.toXDR("base64"), lastModifiedLedgerSeq: 1 });
          }
          if (type === xdr.LedgerEntryType.trustline() && chain.account && chain.trustline) {
            const data = trustlineEntry(key.trustLine().accountId());
            entries.push({ key: key.toXDR("base64"), xdr: data.toXDR("base64"), lastModifiedLedgerSeq: 1 });
          }
        }
        return reply({ entries, latestLedger: 100 });
      }
      case "sendTransaction":
        envelope = body.params.transaction as string;
        if (chain.send === "refused") {
          return reply({ status: "ERROR", hash: "e2e".padEnd(64, "0"), latestLedger: 100, latestLedgerCloseTime: "0" });
        }
        if (chain.send !== "failed") chain.trustline = true;
        return reply({ status: "PENDING", hash: "e2e".padEnd(64, "0"), latestLedger: 100, latestLedgerCloseTime: "0" });
      case "getTransaction":
        return reply({
          status: chain.send === "failed" ? "FAILED" : "SUCCESS",
          latestLedger: 101,
          latestLedgerCloseTime: "0",
          oldestLedger: 1,
          oldestLedgerCloseTime: "0",
          ledger: 101,
          createdAt: "0",
          applicationOrder: 1,
          feeBump: false,
          envelopeXdr: envelope,
          resultXdr: successResult(),
          resultMetaXdr: xdr.TransactionMeta.fromXDR(Buffer.from([0, 0, 0, 0, 0, 0, 0, 0])).toXDR("base64"),
        });
      default:
        return route.fulfill({ status: 400, body: `unexpected method ${body.method}` });
    }
  });
}
