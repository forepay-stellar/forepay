import { describe, expect, it } from "vitest";
import { shortAddress } from "./format";

describe("shortAddress", () => {
  it("keeps the first and last four characters, as the wallet chip shows them", () => {
    expect(shortAddress("GBX4ABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMN7QPA")).toBe("GBX4…7QPA");
  });
});
