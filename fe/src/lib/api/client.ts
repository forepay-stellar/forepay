import type { AdvanceSummary, LedgerTransaction } from "./types";

/**
 * Typed calls to the #16 API. Shared by #20 and #21.
 *
 * Until #16 serves these routes, `NEXT_PUBLIC_API_URL` is left empty and every call answers from the
 * fixtures below, which use the brief's example figures (§4). When #16 lands, only `fetchJson` and the
 * two route paths change; screens keep calling these functions.
 *
 * The localStorage key `forepay.mock.ledger` picks the fixtures' state, for trying each screen by hand:
 * `none` (no advance yet), `active` (the default, 30.00 of 90.00 repaid), `repaid` (all of it), or
 * `error` (the API does not answer).
 *
 * PROVISIONAL route paths: agree them with @Lin1er.
 */
const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/+$/, "");

export const usingMockApi = API_URL === "";

type Wire<T> = { [K in keyof T]: T[K] extends bigint ? string : T[K] };

function fromWire<T>(row: Wire<T>, bigintKeys: (keyof T)[]): T {
  const out = { ...row } as Record<string, unknown>;
  for (const k of bigintKeys) out[k as string] = BigInt(row[k] as unknown as string);
  return out as T;
}

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { headers: { accept: "application/json" }, cache: "no-store" });
  if (!res.ok) throw new Error(`The API answered ${res.status} for ${path}`);
  return (await res.json()) as T;
}

/** Every advance this wallet has taken, newest first. */
export async function getAdvances(borrower: string): Promise<AdvanceSummary[]> {
  if (usingMockApi) return mock.advances(borrower);
  const rows = await fetchJson<Wire<AdvanceSummary>[]>(`/advances?borrower=${encodeURIComponent(borrower)}`);
  return rows.map((r) => fromWire<AdvanceSummary>(r, ["revenueCents", "principal", "repaid", "openedAt"]));
}

/** Every advance and repayment for this wallet, newest first. */
export async function getTransactions(borrower: string): Promise<LedgerTransaction[]> {
  if (usingMockApi) return mock.transactions();
  const rows = await fetchJson<Wire<LedgerTransaction>[]>(`/transactions?borrower=${encodeURIComponent(borrower)}`);
  return rows.map((r) => fromWire<LedgerTransaction>(r, ["amount", "at"]));
}

// ---- Fixtures, until #16 ----

const NULLIFIER = "7c21d0a3f9c2e81b44fa0d5e6b7a8c9d0e1f2a3b4c5d6e7f8091a2b3c4d5e6f7";
const OPENED = 1_791_806_400n; // 12 Oct 2026

type MockLedger = "none" | "active" | "repaid" | "error";

function mockLedger(): MockLedger {
  let value: string | null = null;
  try {
    value = window.localStorage.getItem("forepay.mock.ledger");
  } catch {
    // No storage (a private window): the default.
  }
  return value === "none" || value === "repaid" || value === "error" ? value : "active";
}

/** The API not answering, or no rows at all before the first advance. */
function guard(state: MockLedger): boolean {
  if (state === "error") throw new Error("The API did not answer (forepay.mock.ledger is error)");
  return state !== "none";
}

const mock = {
  // Proven revenue $360.00 → 25% = 90.00 USDC, 30.00 repaid (brief §4), or all of it when `repaid`.
  advances: async (borrower: string): Promise<AdvanceSummary[]> => {
    const state = mockLedger();
    if (!guard(state)) return [];
    return [
      {
        nullifier: NULLIFIER,
        borrower,
        windowStart: "2026-07-01",
        windowEnd: "2026-09-30",
        revenueCents: 36_000n,
        principal: 900_000_000n,
        repaid: state === "repaid" ? 900_000_000n : 300_000_000n,
        openedAt: OPENED,
        txHash: "a3f9c2".padEnd(64, "0"),
      },
    ];
  },
  // The 3a and 3b frames' list: 20.00 repaid on 20 Oct, 10.00 that never went through, 10.00 on 24 Oct.
  // `repaid` adds the last 60.00 on 26 Oct.
  transactions: async (): Promise<LedgerTransaction[]> => {
    const state = mockLedger();
    if (!guard(state)) return [];
    return [
      ...(state === "repaid"
        ? [{ hash: "c4d7e1".padEnd(64, "5"), kind: "repayment" as const, amount: 600_000_000n, at: OPENED + 1_209_600n, status: "completed" as const, nullifier: NULLIFIER }]
        : []),
      { hash: "e90b13".padEnd(64, "1"), kind: "repayment", amount: 100_000_000n, at: OPENED + 1_036_800n, status: "completed", nullifier: NULLIFIER },
      { hash: "f1c2d0".padEnd(64, "2"), kind: "repayment", amount: 100_000_000n, at: OPENED + 1_036_000n, status: "failed", nullifier: NULLIFIER },
      { hash: "7c21d0".padEnd(64, "3"), kind: "repayment", amount: 200_000_000n, at: OPENED + 691_200n, status: "completed", nullifier: NULLIFIER },
      { hash: "a3f9c2".padEnd(64, "0"), kind: "advance", amount: 900_000_000n, at: OPENED, status: "completed", nullifier: NULLIFIER },
      { hash: "5b8e44".padEnd(64, "4"), kind: "trustline", amount: 0n, at: OPENED - 600n, status: "completed", nullifier: "" },
    ];
  },
};
