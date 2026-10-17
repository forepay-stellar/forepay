import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

const readUsdcStatus = vi.fn();
vi.mock("@/lib/stellar/trustline", () => ({ readUsdcStatus }));
const { useUsdcStatus } = await import("./useUsdcStatus");

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useUsdcStatus", () => {
  it("does not read anything without a wallet", () => {
    renderHook(() => useUsdcStatus(null), { wrapper });
    expect(readUsdcStatus).not.toHaveBeenCalled();
  });

  it("reads the connected wallet's status from the ledger", async () => {
    readUsdcStatus.mockResolvedValue("missing");
    const { result } = renderHook(() => useUsdcStatus("GA6H"), { wrapper });
    await waitFor(() => expect(result.current.data).toBe("missing"));
    expect(readUsdcStatus).toHaveBeenCalledWith("GA6H");
  });

  it("surfaces a failed read as an error, never as a status", async () => {
    readUsdcStatus.mockRejectedValue(new Error("timeout"));
    const { result } = renderHook(() => useUsdcStatus("GB00"), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });
});
