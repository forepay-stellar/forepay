import { describe, expect, it } from "vitest";
import {
  classifyConnectError,
  classifySignError,
  contractFailureCopy,
  failureCopy,
  isSignatureDeclined,
  proveFailureCopy,
  tooSmallCopy,
  type ProveFailure,
  type WalletFailure,
} from "./errors";
import { WalletError, WalletSignError } from "./stellar/wallet-error";

describe("classifyConnectError", () => {
  it("treats closing the picker as no failure at all", () => {
    expect(classifyConnectError(new WalletError("The user closed the modal.", -1))).toBeNull();
  });

  it("reads a rejection in the wallet as declined", () => {
    expect(classifyConnectError(new WalletError("The user rejected this request.", -4))).toBe("declined");
  });

  it("reads a locked wallet as locked, including Freighter's empty address", () => {
    expect(classifyConnectError(new WalletError("Freighter is locked"))).toBe("locked");
    expect(
      classifyConnectError(
        new WalletError("Getting the address from Freighter is not allowed, please request access first.", -3),
      ),
    ).toBe("locked");
  });

  it("reads a missing extension as not found", () => {
    expect(classifyConnectError(new WalletError("Freighter is not connected"))).toBe("notFound");
  });

  it("keeps anything it does not recognise as unknown, never a nicer guess", () => {
    expect(classifyConnectError(new Error("socket hang up"))).toBe("unknown");
  });
});

describe("isSignatureDeclined", () => {
  it("is true for a rejected signature and false for a network failure", () => {
    expect(isSignatureDeclined(new WalletError("User declined access"))).toBe(true);
    expect(isSignatureDeclined(new Error("The transaction did not go through (FAILED)"))).toBe(false);
  });
});

describe("failureCopy", () => {
  const kinds: WalletFailure[] = [
    "declined",
    "locked",
    "wrongNetwork",
    "notFound",
    "unknown",
    "unfunded",
    "readFailed",
    "trustlineFailed",
  ];

  it("gives every failure its own title", () => {
    const titles = kinds.map((k) => failureCopy(k).title);
    expect(new Set(titles).size).toBe(kinds.length);
  });

  it("keeps UI copy free of colons, semicolons, em dashes and middle dots (brief §3)", () => {
    for (const k of [...kinds, "signLocked", "signWrongNetwork", "signNoAnswer"] as WalletFailure[]) {
      const { title, body } = failureCopy(k, "Freighter");
      expect(`${title} ${body}`).not.toMatch(/[:;—·]/);
    }
  });

  it("names the wallet the creator is using", () => {
    expect(failureCopy("locked", "xBull").title).toBe("Unlock xBull first");
    expect(failureCopy("signLocked", "Rabet").title).toBe("Unlock Rabet first");
    expect(failureCopy("signNoAnswer", "xBull").title).toBe("xBull did not answer");
  });
});

describe("classifySignError", () => {
  it("names the wallet's own trouble, never the network's", () => {
    expect(classifySignError(new WalletSignError(new WalletError("The user rejected this request.", -4)))).toBe("declined");
    expect(classifySignError(new WalletSignError(new WalletError("Freighter is locked")))).toBe("locked");
    expect(classifySignError(new WalletSignError(new Error("network passphrase mismatch")))).toBe("wrongNetwork");
    expect(classifySignError(new WalletSignError(new Error("timeout")))).toBe("noAnswer");
  });
});

describe("contractFailureCopy", () => {
  const codes = [10, 11, 12, 13, 14, 20, 30, 31, 40, 41, 50, 51, 52, 99];

  it("keeps every contract refusal inside the copy rules", () => {
    for (const c of codes) {
      const { title, body } = contractFailureCopy(c);
      expect(`${title} ${body}`).not.toMatch(/[:;—·]/);
    }
  });

  it("uses the Prove and accept board's words for the refusals it names", () => {
    expect(contractFailureCopy(20).title).toBe("This proof was already used");
    expect(contractFailureCopy(14).title).toBe("We could not confirm this proof");
    expect(contractFailureCopy(11)).toEqual(contractFailureCopy(14));
    expect(contractFailureCopy(31).title).toBe("Not enough revenue yet");
    expect(contractFailureCopy(12).title).toBe("This proof expired");
    expect(contractFailureCopy(40).title).toBe("Advances are paused right now");
    expect(contractFailureCopy(41).title).toBe("Your wallet needs to accept USDC first");
  });
});

describe("proveFailureCopy", () => {
  const kinds: ProveFailure[] = [
    "cancelled",
    "declined",
    "refused",
    "charged",
    "unconfirmed",
    "sentUnreachable",
    "unreachable",
    "unexpected",
    "simulationFailed",
    "notConfigured",
    "walletLocked",
    "walletWrongNetwork",
    "walletNoAnswer",
    "relayNotReady",
    "googleSignIn",
    "noAdsense",
    "relayFailed",
    "proofRunning",
    "proofGone",
    "relayUnreachable",
    "googleUnavailable",
    "popupBlocked",
  ];

  it("keeps every failure inside the copy rules, and never says Something went wrong", () => {
    for (const k of kinds) {
      const { title, body } = proveFailureCopy(k);
      expect(`${title} ${body}`).not.toMatch(/[:;—·]|something went wrong/i);
    }
  });

  it("says nothing was charged only when that is true", () => {
    expect(proveFailureCopy("refused").body).toMatch(/Nothing was charged/);
    expect(proveFailureCopy("charged").body).not.toMatch(/Nothing was charged/);
    expect(proveFailureCopy("unconfirmed").body).not.toMatch(/Nothing was charged/);
  });

  it("gives every failure its own words", () => {
    const all = kinds.map((k) => JSON.stringify(proveFailureCopy(k)));
    expect(new Set(all).size).toBe(kinds.length);
  });

  it("names the wallet that declined", () => {
    expect(proveFailureCopy("declined", "xBull").title).toBe("You declined in xBull");
  });
});

describe("tooSmallCopy", () => {
  it("shows the creator's own figure, as the board does", () => {
    expect(tooSmallCopy("$3.20", { share: "25%", minimum: "1 USDC" }).body).toBe(
      "25% of $3.20 is under 1 USDC, the smallest advance we can send. Your proof was not used.",
    );
  });

  it("names no rate or minimum it does not have from the contract", () => {
    expect(tooSmallCopy("$3.20").body).toBe(
      "$3.20 is too little for the smallest advance we can send. Your proof was not used.",
    );
  });
});
