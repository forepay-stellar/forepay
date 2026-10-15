import { describe, expect, it } from "vitest";
import { WalletError, toWalletError } from "./wallet-error";

describe("toWalletError", () => {
  it("keeps the code and message of the kit's plain { code, message } rejections", () => {
    const e = toWalletError({ code: -1, message: "The user closed the modal." });
    expect(e).toBeInstanceOf(WalletError);
    expect(e.code).toBe(-1);
    expect(e.message).toBe("The user closed the modal.");
  });

  it("passes a WalletError through and wraps a bare string", () => {
    const original = new WalletError("x", 2);
    expect(toWalletError(original)).toBe(original);
    expect(toWalletError("locked").message).toBe("locked");
  });

  it("never produces [object Object]", () => {
    expect(toWalletError({}).message).toBe("Wallet request failed");
  });
});
