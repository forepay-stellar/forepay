// @vitest-environment node
import { Account, Asset, BASE_FEE, Networks, Operation, TransactionBuilder, rpc } from "@stellar/stellar-sdk";
import { describe, expect, it, vi } from "vitest";
import { SubmitError, submitSigned, waitFor } from "./submit";

const ADDRESS = "GA6HCMBLTZS5VYYBCATRBRZ3BZJMAFUDKYYF6AH6MVCMGWMRDNSWJPIH";
const tx = new TransactionBuilder(new Account(ADDRESS, "1"), { fee: BASE_FEE, networkPassphrase: Networks.TESTNET })
  .addOperation(Operation.changeTrust({ asset: new Asset("USDC", ADDRESS) }))
  .setTimeout(30)
  .build();
const signed = tx.toXDR();
/** The signed transaction's own hash, which the network answers with too. */
const HASH = tx.hash().toString("hex");
/** Its time limit, `setTimeout(30)` above: past it, a ledger can no longer take it. */
const VALID_UNTIL = Number(tx.timeBounds?.maxTime);

function server(send: string | Error, final?: rpc.Api.GetTransactionStatus) {
  return {
    sendTransaction: vi.fn(async () => {
      if (send instanceof Error) throw send;
      return { status: send, hash: HASH };
    }),
    pollTransaction: vi.fn(async () => ({ status: final })),
  } as unknown as rpc.Server;
}

describe("submitSigned", () => {
  it("names the hash before sending, then waits for the ledger", async () => {
    const onSent = vi.fn();
    const s = server("PENDING", rpc.Api.GetTransactionStatus.SUCCESS);
    await expect(submitSigned(s, signed, { attempts: 5, onSent })).resolves.toMatchObject({ hash: HASH });
    expect(onSent).toHaveBeenCalledWith(HASH, VALID_UNTIL);
    expect(s.pollTransaction).toHaveBeenCalledWith(HASH, { attempts: 5 });
  });

  it("names the hash even for a send that gets no answer, since it may be out", async () => {
    const onSent = vi.fn();
    await expect(
      submitSigned(server(new TypeError("fetch failed")), signed, { attempts: 5, onSent }),
    ).rejects.toMatchObject({ outcome: "unconfirmed", noAnswer: true });
    expect(onSent).toHaveBeenCalledWith(HASH, VALID_UNTIL);
  });

  it("reports a send the network refused as refused, so the caller forgets the hash it was given", async () => {
    const onSent = vi.fn();
    const err = await submitSigned(server("ERROR"), signed, { attempts: 5, onSent }).catch((e) => e);
    expect(err).toBeInstanceOf(SubmitError);
    expect(err.outcome).toBe("refused");
    expect(err.noAnswer).toBe(false);
  });

  it("names nothing for a wallet answer that is not a transaction", async () => {
    const onSent = vi.fn();
    await expect(submitSigned(server("PENDING"), "not a transaction", { attempts: 5, onSent })).rejects.toMatchObject({
      outcome: "refused",
    });
    expect(onSent).not.toHaveBeenCalled();
  });

  it("reads a send with no answer as unconfirmed, and a wallet answer that is not a transaction as refused", async () => {
    await expect(submitSigned(server(new TypeError("fetch failed")), signed, { attempts: 5 })).rejects.toMatchObject({
      outcome: "unconfirmed",
      noAnswer: true,
    });
    await expect(submitSigned(server("PENDING"), "not a transaction", { attempts: 5 })).rejects.toMatchObject({
      outcome: "refused",
    });
  });
});

describe("waitFor", () => {
  it("tells a ledger failure from a transaction not seen yet", async () => {
    await expect(waitFor(server("PENDING", rpc.Api.GetTransactionStatus.FAILED), HASH, 5)).rejects.toMatchObject({
      outcome: "failed",
    });
    await expect(waitFor(server("PENDING", rpc.Api.GetTransactionStatus.NOT_FOUND), HASH, 5)).rejects.toMatchObject({
      outcome: "unconfirmed",
      noAnswer: false,
    });
  });

  it("carries the ledger's close time with a not found, so a time limit is judged on its clock", async () => {
    const answer = { status: rpc.Api.GetTransactionStatus.NOT_FOUND, latestLedgerCloseTime: "1792000000" };
    const node = { pollTransaction: vi.fn(async () => answer) } as unknown as rpc.Server;
    await expect(waitFor(node, HASH, 5)).rejects.toMatchObject({
      outcome: "unconfirmed",
      noAnswer: false,
      ledgerTime: 1_792_000_000,
    });
  });

  it("tells a node that did not answer from a ledger that said not yet", async () => {
    const down = {
      pollTransaction: vi.fn(async () => {
        throw new Error("Request failed with status code 503");
      }),
    } as unknown as rpc.Server;
    await expect(waitFor(down, HASH, 5)).rejects.toMatchObject({ outcome: "unconfirmed", noAnswer: true });
  });
});
