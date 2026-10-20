import { Account, BASE_FEE, Networks, Operation, TransactionBuilder } from "@stellar/stellar-sdk";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SignAdvance } from "./components/SignAdvance";
import { maxFee } from "./fee";

const ADDRESS = "GA6HCMBLTZS5VYYBCATRBRZ3BZJMAFUDKYYF6AH6MVCMGWMRDNSWJPIH";

function signable(fee: string) {
  return new TransactionBuilder(new Account(ADDRESS, "1"), { fee, networkPassphrase: Networks.TESTNET })
    .addOperation(Operation.bumpSequence({ bumpTo: "2" }))
    .setTimeout(180)
    .build()
    .toXDR();
}

describe("the network fee on 2c", () => {
  it("is read from the transaction the wallet is asked to sign", () => {
    expect(maxFee(signable(BASE_FEE))).toBe(100n);
    expect(maxFee(signable("312345"))).toBe(312_345n);
  });

  it("shows on the card once known, rounded up", () => {
    const address = ADDRESS;
    const { rerender } = render(
      <SignAdvance walletName="Freighter" address={address} advance={900_000_000n} fee={undefined} onCancel={() => {}} />,
    );
    expect(screen.queryByText(/XLM/)).toBeNull();
    rerender(
      <SignAdvance
        walletName="Freighter"
        address={address}
        advance={900_000_000n}
        fee={maxFee(signable("312345"))}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByText("Up to 0.04 XLM")).toBeTruthy();
    expect(screen.getByText("90.00 USDC")).toBeTruthy();
  });
});
