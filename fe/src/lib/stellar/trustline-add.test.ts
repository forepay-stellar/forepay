// @vitest-environment node
import { Account, rpc } from "@stellar/stellar-sdk";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./network", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./network")>()),
  RPC_URL: "https://rpc.test.invalid",
  USDC: { code: "USDC", issuer: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5" },
}));

const { TrustlineError, addUsdcTrustline } = await import("./trustline");

const ADDRESS = "GA6HCMBLTZS5VYYBCATRBRZ3BZJMAFUDKYYF6AH6MVCMGWMRDNSWJPIH";
const HASH = "a".repeat(64);
const sign = vi.fn(async (xdr: string) => xdr);

function chain(send: string, final?: rpc.Api.GetTransactionStatus) {
  vi.spyOn(rpc.Server.prototype, "getAccount").mockResolvedValue(new Account(ADDRESS, "1"));
  vi.spyOn(rpc.Server.prototype, "sendTransaction").mockResolvedValue({
    status: send,
    hash: HASH,
  } as unknown as rpc.Api.SendTransactionResponse);
  return vi
    .spyOn(rpc.Server.prototype, "pollTransaction")
    .mockResolvedValue({ status: final } as unknown as rpc.Api.GetTransactionResponse);
}

afterEach(() => vi.restoreAllMocks());

describe("addUsdcTrustline", () => {
  it("signs a changeTrust in the wallet and resolves with the hash once confirmed", async () => {
    chain("PENDING", rpc.Api.GetTransactionStatus.SUCCESS);
    await expect(addUsdcTrustline(ADDRESS, sign)).resolves.toBe(HASH);
    expect(sign).toHaveBeenCalledOnce();
  });

  it("reports a refused submission as refused, so the UI can say nothing was charged", async () => {
    const poll = chain("ERROR");
    const err = await addUsdcTrustline(ADDRESS, sign).catch((e) => e);
    expect(err).toBeInstanceOf(TrustlineError);
    expect(err.outcome).toBe("refused");
    expect(poll).not.toHaveBeenCalled();
  });

  it("reports a ledger failure as failed, where the fee was spent", async () => {
    chain("PENDING", rpc.Api.GetTransactionStatus.FAILED);
    await expect(addUsdcTrustline(ADDRESS, sign)).rejects.toMatchObject({ outcome: "failed" });
  });

  it("reports a transaction still not found after polling as unconfirmed", async () => {
    chain("PENDING", rpc.Api.GetTransactionStatus.NOT_FOUND);
    await expect(addUsdcTrustline(ADDRESS, sign)).rejects.toMatchObject({ outcome: "unconfirmed" });
  });

  it("reports a submission that gets no answer as unconfirmed, never as nothing charged", async () => {
    vi.spyOn(rpc.Server.prototype, "getAccount").mockResolvedValue(new Account(ADDRESS, "1"));
    vi.spyOn(rpc.Server.prototype, "sendTransaction").mockRejectedValue(new TypeError("fetch failed"));
    await expect(addUsdcTrustline(ADDRESS, sign)).rejects.toMatchObject({ outcome: "unconfirmed" });
  });

  it("reports a wallet answer that is not a transaction as refused, since nothing was sent", async () => {
    const poll = chain("PENDING", rpc.Api.GetTransactionStatus.SUCCESS);
    await expect(addUsdcTrustline(ADDRESS, async () => "not a transaction")).rejects.toMatchObject({
      outcome: "refused",
    });
    expect(rpc.Server.prototype.sendTransaction).not.toHaveBeenCalled();
    expect(poll).not.toHaveBeenCalled();
  });

  it("reports a poll that loses the connection after PENDING as unconfirmed", async () => {
    chain("PENDING", rpc.Api.GetTransactionStatus.SUCCESS).mockRejectedValue(new TypeError("fetch failed"));
    await expect(addUsdcTrustline(ADDRESS, sign)).rejects.toMatchObject({ outcome: "unconfirmed" });
  });

  it("lets the wallet's own rejection through untouched", async () => {
    chain("PENDING", rpc.Api.GetTransactionStatus.SUCCESS);
    const declined = new Error("The user rejected this request.");
    await expect(addUsdcTrustline(ADDRESS, async () => Promise.reject(declined))).rejects.toBe(declined);
  });
});
