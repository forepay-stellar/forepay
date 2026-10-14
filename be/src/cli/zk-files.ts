/**
 * Fetch the ZK circuit files zkFetch needs (see reclaim/zk-files.ts).
 *
 *   pnpm -C be zk:files
 *
 * Runs the download script that ships with @reclaimprotocol/zk-symmetric-crypto. It
 * downloads that repository at the commit the installed version pins, and moves
 * `resources/` and `bin/` into the package. Its working directory has to be on the
 * same filesystem as node_modules, because it moves with rename(); a directory under
 * be/node_modules is.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { ZK_ENGINE, hasZkFiles, zkPackageDir } from "../reclaim/zk-files.js";
import { BE_ROOT, die } from "./env.js";

if (hasZkFiles()) {
  console.log(`ZK circuit files for ${ZK_ENGINE} are already in place.`);
  process.exit(0);
}
const work = join(BE_ROOT, "node_modules", ".cache", "zk-files");
mkdirSync(work, { recursive: true });
const script = join(zkPackageDir(), "lib", "scripts", "download-files.js");
console.log(`Fetching ZK circuit files (~330 MB) with ${script}…`);
const run = spawnSync(process.execPath, [script], { cwd: work, stdio: "inherit" });
if (run.status !== 0 || !hasZkFiles()) die("the download did not leave the circuit files in place");
console.log("Done.");
