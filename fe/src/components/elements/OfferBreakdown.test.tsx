import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { OfferBreakdown } from "./OfferBreakdown";

afterEach(cleanup);

describe("OfferBreakdown", () => {
  it("drops the year on a phone when the window sits in one year", () => {
    render(<OfferBreakdown revenue="$360.00" windowShort="Jul to Sep 2026" advance={900_000_000n} />);
    expect(screen.getByText("AdSense revenue, Jul to Sep")).toBeTruthy();
  });

  it("keeps both years on a phone when the window crosses one", () => {
    render(<OfferBreakdown revenue="$360.00" windowShort="Nov 2026 to Jan 2027" advance={900_000_000n} />);
    expect(screen.getByText("AdSense revenue, Nov 2026 to Jan 2027")).toBeTruthy();
  });
});
