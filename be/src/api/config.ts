/**
 * API configuration (#16): recorded defaults, overridable from the environment, and
 * every override visible.
 *
 * The failure this guards against: a `.env` written before a redeploy still names the
 * old contract, and every answer the API gives is about a contract nobody uses any
 * more, silently. So `/config` reports, per value, whether it came from the record or
 * from the environment, and whether the contracts in use are the recorded ones.
 */
import { StrKey } from "@stellar/stellar-sdk";

import { RECORDED, type ContractName } from "../network.js";

export interface ApiConfig {
  network: "testnet";
  networkPassphrase: string;
  rpcUrl: string;
  contracts: Record<ContractName, string | null>;
  /** Exact origins allowed by CORS. Never a wildcard. */
  corsOrigins: string[];
  port: number;
}

export type Source = "recorded" | "env";

export interface LoadedConfig {
  config: ApiConfig;
  sources: Record<"rpcUrl" | ContractName, Source>;
  /** True when every contract in use equals docs/deployments.md. */
  recorded: boolean;
}

const CONTRACT_ENV: Record<ContractName, string> = {
  reclaimVerifier: "RECLAIM_VERIFIER_ID",
  usdcSac: "USDC_SAC_ID",
  advance: "ADVANCE_CONTRACT_ID",
};

/** One origin: scheme, host, optional port. No path, no trailing slash, no wildcard. */
export function parseOrigin(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`CORS origin is not a URL: ${raw}`);
  }
  if (url.origin !== raw) {
    throw new Error(`CORS origin must be exactly scheme://host[:port], got ${raw} (expected ${url.origin})`);
  }
  if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
    throw new Error(`CORS origin must be https (localhost excepted): ${raw}`);
  }
  return url.origin;
}

export function loadConfig(env: Record<string, string | undefined> = process.env): LoadedConfig {
  const get = (k: string) => env[k]?.trim() || undefined;

  if (get("STELLAR_NETWORK_PASSPHRASE") && get("STELLAR_NETWORK_PASSPHRASE") !== RECORDED.networkPassphrase) {
    throw new Error("only testnet is in scope; STELLAR_NETWORK_PASSPHRASE must be the testnet passphrase or unset");
  }

  const rpcUrl = get("STELLAR_RPC_URL") ?? RECORDED.rpcUrl;
  if (!/^https:\/\//.test(rpcUrl)) throw new Error(`STELLAR_RPC_URL must be https: ${rpcUrl}`);

  const contracts = {} as Record<ContractName, string | null>;
  const sources = { rpcUrl: get("STELLAR_RPC_URL") ? "env" : "recorded" } as LoadedConfig["sources"];
  for (const name of Object.keys(CONTRACT_ENV) as ContractName[]) {
    const fromEnv = get(CONTRACT_ENV[name]);
    if (fromEnv !== undefined && !StrKey.isValidContract(fromEnv)) {
      throw new Error(`${CONTRACT_ENV[name]} is not a contract address (C…): ${fromEnv}`);
    }
    contracts[name] = fromEnv ?? RECORDED.contracts[name];
    sources[name] = fromEnv !== undefined ? "env" : "recorded";
  }

  const corsOrigins = (get("CORS_ORIGINS") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map(parseOrigin);

  const port = Number(get("PORT") ?? 8787);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`PORT is not a port: ${get("PORT")}`);

  const recorded = (Object.keys(contracts) as ContractName[]).every((n) => contracts[n] === RECORDED.contracts[n]);

  return {
    config: {
      network: "testnet",
      networkPassphrase: RECORDED.networkPassphrase,
      rpcUrl,
      contracts,
      corsOrigins,
      port,
    },
    sources,
    recorded,
  };
}
