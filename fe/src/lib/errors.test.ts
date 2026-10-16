import { describe, expect, it } from "vitest";
import { classifyConnectError, classifySignError, failureCopy, isSignatureDeclined, type WalletFailure } from "./errors";
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
