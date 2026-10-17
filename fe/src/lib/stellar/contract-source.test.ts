// @vitest-environment node
import { rpc } from "@stellar/stellar-sdk";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./network", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./network")>()),
  RPC_URL: "https://rpc.test.invalid",
}));
vi.stubEnv("NEXT_PUBLIC_ADVANCE_CONTRACT_ID", "CCQFL2Q66DHFAZU2KPRWNHU4FTZJW75N5XLNXECFFGMW3PROIXJPI2HS");
const { quote } = await import("./contract");

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
