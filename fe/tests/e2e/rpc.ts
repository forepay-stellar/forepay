import type { Page, Route } from "@playwright/test";
import {
  Address,
  Asset,
  FeeBumpTransaction,
  Networks,
  SorobanDataBuilder,
  TransactionBuilder,
  nativeToScVal,
  scValToNative,
  xdr,
  type Operation,
} from "@stellar/stellar-sdk";

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
  /** How the advance contract answers (#20). Leave it out and it accepts every proof. */
  advance?: AdvanceChain;
  /** The USDC the wallet holds, in stroops, once it has a trustline. Defaults to none (#21). */
  usdc?: bigint;
  /**
   * How every other call to the advance contract goes, `repay` above all (#21). Without it, such a call
   * is refused as unexpected.
   */
  contract?: ContractStub;
};

export type ContractStub = {
  /** Refuse the simulation with this contract code (`docs/interface.md` §7), e.g. 51. */
  refuse?: number;
  /** How a submitted call ends: lands (default), refused before the ledger, or failed on it. */
  send?: "ok" | "refused" | "failed";
  /** Holds the ledger's answer back until it resolves, so a spec can see the pending state. */
  hold?: Promise<void>;
  /** While true, a sent call is not on the ledger yet (NOT_FOUND); set it false to let it land. */
  holdLedger?: boolean;
  /** Called once a `repay` lands, with its amount in stroops and its hash. */
  onRepaid?: (amount: bigint, hash: string) => void;
  /** The method and arguments of every call that reached the ledger, for assertions. */
  sent?: { method: string; args: unknown[] }[];
};

/** The calls 02 Prove and accept makes; the `advance` stub above answers these. */
const ADVANCE_CALLS = new Set(["quote", "request_advance", "nullifier_for", "advance", "sizing"]);

/** The advance contract, as far as 02 Prove and accept can see it. */
export type AdvanceChain = {
  /**
   * A code from docs/interface.md §7 that `request_advance` refuses with, from its `from`-th simulation
   * on. The stub cannot tell a check from an accept (both are the same simulation), so it counts them:
   * 1 is the check before the offer, 2 is the next one, the accept in a plain run, or the re-check
   * after Allow USDC or Try again. `from: 2` is a proof that expired while the offer was open.
   */
  refuse?: { code: number; from: number };
  /** How a sent `request_advance` ends: lands (default), refused before the ledger, failed on it, or never confirmed. */
  send?: "ok" | "refused" | "failed" | "pending";
  /** Refuse every `request_advance` simulation with a host error that carries no contract code. */
  simulationFails?: boolean;
  /** Hold every `request_advance` simulation after the first this long, so 2c can be seen. */
  acceptDelayMs?: number;
  /** Answer `sizing()` with a server error, as a node that does not answer that read. */
  sizingDown?: boolean;
  /** Answer `sizing()` this late, to see what shows while it loads. */
  sizingDelayMs?: number;
  /** While true, a sent `request_advance` is not on the ledger yet; set it false to let it land. */
  holdLedger?: boolean;
  /** Answer this many polls for the sent `request_advance` with a server error, as a node that is down. */
  dropPolls?: number;
  /** Take the `request_advance` but lose the answer to the send itself, as a connection that drops. */
  loseSendAnswer?: boolean;
  /** Set by the stub: how many `request_advance` transactions were sent. */
  sent?: number;
  /** Set by the stub: the hash of the last `request_advance` sent, as the network computes it. */
  hash?: string;
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

function trustlineEntry(accountId: xdr.AccountId, balance: bigint) {
  return xdr.LedgerEntryData.trustline(
    new xdr.TrustLineEntry({
      accountId,
      asset: USDC.toTrustLineXDRObject(),
      balance: xdr.Int64.fromString(balance.toString()),
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

const CAP_STROOPS = 1_000_000_000n;
const MIN_STROOPS = 10_000_000n;
const OPENED_AT = 1_791_763_200n; // 12 Oct 2026, the date on the 2d frame
const NULLIFIER = Buffer.alloc(32, 7);

/** What the real contract's sizing gives (sc/advance/src/sizing.rs), so the stub answers like it. */
function size(revenueUsd: string): bigint {
  const [whole, frac = ""] = revenueUsd.split(".");
  const cents = BigInt(whole) * 100n + BigInt(frac.padEnd(2, "0") || "0");
  const stroops = (cents * 100_000n * 25n) / 100n;
  return stroops > CAP_STROOPS ? CAP_STROOPS : stroops;
}

function i128(v: bigint) {
  return nativeToScVal(v, { type: "i128" });
}

/** The stored `Advance` struct: an ScMap with its fields sorted, as a Soroban contracttype is. */
function storedAdvance(borrower: string, revenueUsd: string) {
  const principal = size(revenueUsd);
  const field = (k: string, v: xdr.ScVal) => new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol(k), val: v });
  return xdr.ScVal.scvMap([
    field("borrower", new Address(borrower).toScVal()),
    field("opened_at", nativeToScVal(OPENED_AT, { type: "u64" })),
    field("principal", i128(principal)),
    field("pub_id", nativeToScVal("pub-4021783466891204", { type: "string" })),
    field("repaid", i128(0n)),
    field("revenue_cents", i128(principal * 4n / 100_000n)),
    field("window_end", nativeToScVal("2026-09-30", { type: "string" })),
    field("window_start", nativeToScVal("2026-07-01", { type: "string" })),
  ]);
}

/** The contract call inside a transaction, or null for a classic one (changeTrust). */
function contractCall(envelope: string): { fn: string; args: xdr.ScVal[]; source: string } | null {
  const tx = TransactionBuilder.fromXDR(envelope, Networks.TESTNET);
  if (tx instanceof FeeBumpTransaction) return null;
  const op = tx.operations[0] as Operation.InvokeHostFunction;
  if (op.type !== "invokeHostFunction") return null;
  const call = op.func.invokeContract();
  return { fn: call.functionName().toString(), args: call.args(), source: tx.source };
}

function contractError(code: number) {
  return { error: `HostError: Error(Contract, #${code})\n\nEvent log (newest first)`, events: [], latestLedger: 100 };
}

function simulated(retval: xdr.ScVal) {
  return {
    transactionData: new SorobanDataBuilder().build().toXDR("base64"),
    minResourceFee: "100",
    results: [{ auth: [], xdr: retval.toXDR("base64") }],
    events: [],
    latestLedger: 100,
  };
}

/** A soroban meta carrying the returned value: what the SDK reads `returnValue` from. */
function metaWithReturn(retval: xdr.ScVal) {
  return new xdr.TransactionMeta(
    3,
    new xdr.TransactionMetaV3({
      ext: new xdr.ExtensionPoint(0),
      txChangesBefore: [],
      operations: [],
      txChangesAfter: [],
      sorobanMeta: new xdr.SorobanTransactionMeta({
        ext: new xdr.SorobanTransactionMetaExt(0),
        events: [],
        returnValue: retval,
        diagnosticEvents: [],
      }),
    }),
  ).toXDR("base64");
}

export async function mockRpc(page: Page, chain: Chain) {
  let checks = 0;
  let sentAdvance: { revenueUsd: string; source: string } | null = null;
  let envelope = "";
  // The last other contract call sent (#21), its hash, and whether it has landed. A transaction lands
  // once, however often the app polls for it.
  let other: { method: string; args: unknown[] } | null = null;
  let otherHash = "";
  let applied = false;
  // Hashes the network has taken, so an unknown or refused one is NOT_FOUND, as on a real node.
  const taken = new Set<string>();
  const notFound = () => ({
    status: "NOT_FOUND",
    latestLedger: 101,
    latestLedgerCloseTime: "0",
    oldestLedger: 1,
    oldestLedgerCloseTime: "0",
  });
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
            const data = trustlineEntry(key.trustLine().accountId(), chain.usdc ?? 0n);
            entries.push({ key: key.toXDR("base64"), xdr: data.toXDR("base64"), lastModifiedLedgerSeq: 1 });
          }
        }
        return reply({ entries, latestLedger: 100 });
      }
      case "simulateTransaction": {
        const call = contractCall(body.params.transaction as string);
        const adv = chain.advance ?? {};
        if (!call) return route.fulfill({ status: 400, body: "not a contract call" });
        if (!ADVANCE_CALLS.has(call.fn)) {
          if (!chain.contract) return route.fulfill({ status: 400, body: `unexpected contract call ${call.fn}` });
          if (chain.contract.refuse !== undefined) return reply(contractError(chain.contract.refuse));
          return reply(simulated(i128(0n)));
        }
        switch (call.fn) {
          case "quote": {
            const stroops = size(scValToNative(call.args[0]) as string);
            return reply(stroops < MIN_STROOPS ? contractError(31) : simulated(i128(stroops)));
          }
          case "request_advance": {
            checks += 1;
            const revenueUsd = scValToNative(call.args[1]) as string;
            const stroops = size(revenueUsd);
            if (checks > 1 && adv.acceptDelayMs) await new Promise((r) => setTimeout(r, adv.acceptDelayMs));
            if (stroops < MIN_STROOPS) return reply(contractError(31));
            if (adv.simulationFails) {
              return reply({ error: "HostError: Error(Auth, InvalidAction)", events: [], latestLedger: 100 });
            }
            if (adv.refuse && checks >= adv.refuse.from) return reply(contractError(adv.refuse.code));
            if (!chain.trustline) return reply(contractError(41));
            return reply(simulated(i128(stroops)));
          }
          case "sizing": {
            // What the production contract answers (#63): a struct, its fields sorted.
            if (adv.sizingDown) return route.fulfill({ status: 503, body: "unavailable" });
            if (adv.sizingDelayMs) await new Promise((r) => setTimeout(r, adv.sizingDelayMs));
            const field = (k: string, v: bigint) => new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol(k), val: i128(v) });
            return reply(
              simulated(
                xdr.ScVal.scvMap([
                  field("cap_stroops", CAP_STROOPS),
                  field("min_stroops", MIN_STROOPS),
                  field("rate_den", 100n),
                  field("rate_num", 25n),
                  field("stroops_per_cent", 100_000n),
                ]),
              ),
            );
          }
          case "nullifier_for":
            return reply(simulated(xdr.ScVal.scvBytes(NULLIFIER)));
          case "advance":
            return reply(
              simulated(sentAdvance ? storedAdvance(sentAdvance.source, sentAdvance.revenueUsd) : xdr.ScVal.scvVoid()),
            );
          default:
            return route.fulfill({ status: 400, body: `unexpected contract call ${call.fn}` });
        }
      }
      case "sendTransaction": {
        envelope = body.params.transaction as string;
        const call = contractCall(envelope);
        if (call?.fn === "request_advance") {
          const adv = (chain.advance ??= {});
          adv.sent = (adv.sent ?? 0) + 1;
          // The network answers with the transaction's own hash, which the app also knows before sending.
          adv.hash = TransactionBuilder.fromXDR(envelope, Networks.TESTNET).hash().toString("hex");
          if (adv.send === "refused") {
            return reply({ status: "ERROR", hash: adv.hash, latestLedger: 100, latestLedgerCloseTime: "0" });
          }
          if (adv.send !== "failed" && adv.send !== "pending") {
            sentAdvance = { revenueUsd: scValToNative(call.args[1]) as string, source: call.source };
          }
          if (adv.loseSendAnswer) {
            adv.loseSendAnswer = false;
            return route.fulfill({ status: 503, body: "unavailable" });
          }
          return reply({ status: "PENDING", hash: adv.hash, latestLedger: 100, latestLedgerCloseTime: "0" });
        }
        if (call && chain.contract) {
          other = { method: call.fn, args: call.args.map((a) => scValToNative(a)) };
          otherHash = TransactionBuilder.fromXDR(envelope, Networks.TESTNET).hash().toString("hex");
          applied = false;
          if ((chain.contract.send ?? "ok") === "refused") {
            return reply({ status: "ERROR", hash: otherHash, latestLedger: 100, latestLedgerCloseTime: "0" });
          }
          taken.add(otherHash);
          return reply({ status: "PENDING", hash: otherHash, latestLedger: 100, latestLedgerCloseTime: "0" });
        }
        if (chain.send === "refused") {
          return reply({ status: "ERROR", hash: "e2e".padEnd(64, "0"), latestLedger: 100, latestLedgerCloseTime: "0" });
        }
        if (chain.send !== "failed") chain.trustline = true;
        return reply({ status: "PENDING", hash: "e2e".padEnd(64, "0"), latestLedger: 100, latestLedgerCloseTime: "0" });
      }
      case "getTransaction": {
        if (chain.advance?.hash && body.params.hash === chain.advance.hash) {
          const adv = chain.advance ?? {};
          if (adv.dropPolls) {
            adv.dropPolls -= 1;
            return route.fulfill({ status: 503, body: "unavailable" });
          }
          if (adv.send === "pending" || adv.holdLedger) {
            return reply({
              status: "NOT_FOUND",
              latestLedger: 101,
              latestLedgerCloseTime: "0",
              oldestLedger: 1,
              oldestLedgerCloseTime: "0",
            });
          }
          return reply({
            status: adv.send === "failed" ? "FAILED" : "SUCCESS",
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
            resultMetaXdr: metaWithReturn(i128(size(sentAdvance?.revenueUsd ?? "0"))),
          });
        }
        let failed = chain.send === "failed";
        // A contract call the network never took (refused, or not sent yet) is not on any ledger.
        if (other && chain.contract && !taken.has(body.params.hash as string)) return reply(notFound());
        if (other && chain.contract && body.params.hash === otherHash) {
          const contract = chain.contract;
          if (contract.holdLedger) return reply(notFound());
          await contract.hold;
          failed = contract.send === "failed";
          if (!failed && !applied) {
            // The ledger moves the USDC, and the indexer behind the API sees it.
            applied = true;
            contract.sent = [...(contract.sent ?? []), other];
            if (other.method === "repay") {
              const amount = other.args[2] as bigint;
              chain.usdc = (chain.usdc ?? 0n) - amount;
              contract.onRepaid?.(amount, otherHash);
            }
          }
        }
        return reply({
          status: failed ? "FAILED" : "SUCCESS",
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
      }
      default:
        return route.fulfill({ status: 400, body: `unexpected method ${body.method}` });
    }
  });
}
