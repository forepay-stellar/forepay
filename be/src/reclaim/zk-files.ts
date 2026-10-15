/**
 * The ZK engine zkFetch proves with, and the circuit files it needs.
 *
 * zk-fetch 1.1.0 defaults to the `stwo` engine. Against Reclaim's production attestor
 * on 2026-10-14 every stwo proof was refused ("invalid proof (ZK proof 0, startIdx 0,
 * record 1)"), with and without the circuit files. `snarkjs` was accepted and its
 * claim verified on chain (docs/deployments.md, #5). So the engine is pinned here,
 * not left to a library default that can change under us.
 *
 * snarkjs needs circuit files (~330 MB) that npm does not ship. They are fetched from
 * Reclaim's zk-symmetric-crypto repository at the commit the installed package pins,
 * by `pnpm -C be zk:files`.
 */
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const ZK_ENGINE = "snarkjs" as const;

/** The installed @reclaimprotocol/zk-symmetric-crypto, as zk-fetch resolves it. */
export function zkPackageDir(): string {
  const req = createRequire(fileURLToPath(import.meta.resolve("@reclaimprotocol/zk-fetch")));
  return dirname(dirname(req.resolve("@reclaimprotocol/zk-symmetric-crypto")));
}

/** One circuit every TLS session can need; its absence means the files were never fetched. */
export function hasZkFiles(): boolean {
  return existsSync(join(zkPackageDir(), "resources", ZK_ENGINE, "aes-128-ctr", "circuit.wasm"));
}
