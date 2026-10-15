// @vitest-environment node
import { Asset, Keypair, rpc, xdr } from "@stellar/stellar-sdk";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./network", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./network")>()),
  RPC_URL: "https://rpc.test.invalid",
  USDC: { code: "USDC", issuer: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5" },
}));

const { readUsdcStatus } = await import("./trustline");

const ADDRESS = "GA6HCMBLTZS5VYYBCATRBRZ3BZJMAFUDKYYF6AH6MVCMGWMRDNSWJPIH";
const USDC = new Asset("USDC", "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5");
const accountId = Keypair.fromPublicKey(ADDRESS).xdrAccountId();
const accountKey = xdr.LedgerKey.account(new xdr.LedgerKeyAccount({ accountId }));
const trustlineKey = xdr.LedgerKey.trustline(
  new xdr.LedgerKeyTrustLine({ accountId, asset: USDC.toTrustLineXDRObject() }),
);

function answer(keys: xdr.LedgerKey[]) {
  return vi
    .spyOn(rpc.Server.prototype, "getLedgerEntries")
    .mockResolvedValue({ entries: keys.map((key) => ({ key }) as unknown as rpc.Api.LedgerEntryResult), latestLedger: 1 });
}

afterEach(() => vi.restoreAllMocks());

describe("readUsdcStatus", () => {
  it("is ready when the trustline exists", async () => {
    answer([accountKey, trustlineKey]);
    await expect(readUsdcStatus(ADDRESS)).resolves.toBe("ready");
  });

  it("is missing when the account exists without a trustline", async () => {
    answer([accountKey]);
    await expect(readUsdcStatus(ADDRESS)).resolves.toBe("missing");
  });

  it("is unfunded when the account does not exist yet", async () => {
    answer([]);
    await expect(readUsdcStatus(ADDRESS)).resolves.toBe("unfunded");
  });

  it("throws when the node fails, instead of reading it as an empty wallet", async () => {
    vi.spyOn(rpc.Server.prototype, "getLedgerEntries").mockRejectedValue(new Error("timeout"));
    await expect(readUsdcStatus(ADDRESS)).rejects.toThrow("timeout");
  });
});
