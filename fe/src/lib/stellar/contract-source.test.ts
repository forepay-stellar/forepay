// @vitest-environment node
import { nativeToScVal, rpc } from "@stellar/stellar-sdk";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./network", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./network")>()),
  RPC_URL: "https://rpc.test.invalid",
}));
vi.stubEnv("NEXT_PUBLIC_ADVANCE_CONTRACT_ID", "CCQFL2Q66DHFAZU2KPRWNHU4FTZJW75N5XLNXECFFGMW3PROIXJPI2HS");
const { TransactionFailedError, awaitAdvance, quote } = await import("./contract");

const ME = "GA6HCMBLTZS5VYYBCATRBRZ3BZJMAFUDKYYF6AH6MVCMGWMRDNSWJPIH";

afterEach(() => vi.restoreAllMocks());

describe("the source account a contract call is built on", () => {
  it("lets a node that did not answer fail as itself, not as a missing account", async () => {
    const busy = Object.assign(new Error("Request failed with status code 503"), {
      isAxiosError: true,
      response: { status: 503 },
    });
    vi.spyOn(rpc.Server.prototype, "getLedgerEntries").mockRejectedValue(busy);
    await expect(quote(ME, "360.00")).rejects.toBe(busy);
  });

  it("names an account that is really not on the ledger", async () => {
    vi.spyOn(rpc.Server.prototype, "getLedgerEntries").mockResolvedValue({
      entries: [],
      latestLedger: 1,
    } as unknown as rpc.Api.GetLedgerEntriesResponse);
    await expect(quote(ME, "360.00")).rejects.toThrow(`Account not found: ${ME}`);
  });
});

describe("awaitAdvance", () => {
  const HASH = "ad".repeat(32);
  const landed = (returnValue?: unknown) =>
    vi.spyOn(rpc.Server.prototype, "pollTransaction").mockResolvedValue({
      status: rpc.Api.GetTransactionStatus.SUCCESS,
      returnValue,
    } as unknown as rpc.Api.GetTransactionResponse);

  it("gives the stroops the advance disbursed", async () => {
    landed(nativeToScVal(900_000_000n, { type: "i128" }));
    await expect(awaitAdvance(HASH)).resolves.toEqual({ hash: HASH, value: 900_000_000n });
  });

  it("never reads a landed advance with no amount as 0 USDC received", async () => {
    landed(undefined);
    await expect(awaitAdvance(HASH)).rejects.toThrow("The ledger answered without the amount disbursed");
  });

  it("names a ledger failure as charged", async () => {
    vi.spyOn(rpc.Server.prototype, "pollTransaction").mockResolvedValue({
      status: rpc.Api.GetTransactionStatus.FAILED,
    } as unknown as rpc.Api.GetTransactionResponse);
    const err = await awaitAdvance(HASH).catch((e) => e);
    expect(err).toBeInstanceOf(TransactionFailedError);
    expect(err.charged).toBe(true);
  });
});
