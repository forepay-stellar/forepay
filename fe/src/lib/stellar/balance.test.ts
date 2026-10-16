// @vitest-environment node
import { Asset, Keypair, rpc, xdr } from "@stellar/stellar-sdk";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./network", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./network")>()),
  RPC_URL: "https://rpc.test.invalid",
  USDC: { code: "USDC", issuer: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5" },
}));

const { readUsdcBalance } = await import("./balance");

const ADDRESS = "GA6HCMBLTZS5VYYBCATRBRZ3BZJMAFUDKYYF6AH6MVCMGWMRDNSWJPIH";
const USDC = new Asset("USDC", "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5");
const accountId = Keypair.fromPublicKey(ADDRESS).xdrAccountId();
const trustlineKey = xdr.LedgerKey.trustline(
  new xdr.LedgerKeyTrustLine({ accountId, asset: USDC.toTrustLineXDRObject() }),
);

function trustline(balance: string) {
  return xdr.LedgerEntryData.trustline(
    new xdr.TrustLineEntry({
      accountId,
      asset: USDC.toTrustLineXDRObject(),
      balance: xdr.Int64.fromString(balance),
      limit: xdr.Int64.fromString("9223372036854775807"),
      flags: 1,
      ext: new xdr.TrustLineEntryExt(0),
    }),
  );
}

afterEach(() => vi.restoreAllMocks());

describe("readUsdcBalance", () => {
  it("reads the trustline balance in stroops", async () => {
    const spy = vi.spyOn(rpc.Server.prototype, "getLedgerEntries").mockResolvedValue({
      entries: [{ key: trustlineKey, val: trustline("8200000000") } as unknown as rpc.Api.LedgerEntryResult],
      latestLedger: 1,
    });
    await expect(readUsdcBalance(ADDRESS)).resolves.toBe(8_200_000_000n);
    expect(spy.mock.calls[0][0].toXDR("base64")).toBe(trustlineKey.toXDR("base64"));
  });

  it("is null when the wallet holds no USDC trustline", async () => {
    vi.spyOn(rpc.Server.prototype, "getLedgerEntries").mockResolvedValue({ entries: [], latestLedger: 1 });
    await expect(readUsdcBalance(ADDRESS)).resolves.toBeNull();
  });

  it("throws when the node fails, instead of reading it as an empty wallet", async () => {
    vi.spyOn(rpc.Server.prototype, "getLedgerEntries").mockRejectedValue(new Error("timeout"));
    await expect(readUsdcBalance(ADDRESS)).rejects.toThrow("timeout");
  });
});
