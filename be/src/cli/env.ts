/**
 * Loading be/.env for the CLIs, under working agreement #6: secrets live in .env,
 * chmod 600, never printed. A group- or world-readable .env is refused, not warned
 * about, because a warning scrolls past and the file stays readable.
 */
import { existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const BE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const ENV_FILE = join(BE_ROOT, ".env");

const secrets: string[] = [];

/** Register a value that must never reach the terminal. */
export function keepSecret(value: string): string {
  if (value) secrets.push(value);
  return value;
}

export function scrub(text: string): string {
  return secrets.reduce((t, s) => t.split(s).join("[redacted]"), text);
}

export function die(msg: string): never {
  console.error(`\n✖ ${scrub(msg)}`);
  process.exit(1);
}

/**
 * Load be/.env if it exists. `required` says whether a missing file is an error.
 * Returns whether a file was loaded.
 */
export function loadEnv(required: boolean): boolean {
  if (!existsSync(ENV_FILE)) {
    if (required) die(`no ${ENV_FILE}. Copy be/.env.example to be/.env, fill it in, chmod 600 it.`);
    return false;
  }
  const mode = statSync(ENV_FILE).mode;
  if ((mode & 0o077) !== 0) {
    die(`${ENV_FILE} is readable by other users (mode ${(mode & 0o777).toString(8)}). Run: chmod 600 be/.env`);
  }
  process.loadEnvFile(ENV_FILE);
  return true;
}

export function need(key: string): string {
  return process.env[key]?.trim() || die(`${key} is not set in be/.env`);
}

export function optional(key: string): string {
  return process.env[key]?.trim() || "";
}
