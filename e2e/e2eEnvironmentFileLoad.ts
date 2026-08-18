import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { e2eRepositoryRoot } from "./e2eRepositoryRoot.js"

/**
 * Loads the ignored local `.env` into `process.env` so the Playwright run and the
 * setup/cleanup scripts it spawns see the same repository-managed development
 * values regardless of the invoking shell. Existing variables win, and a missing
 * file is left to the environment guard in the scripts to report.
 */
export function e2eEnvironmentFileLoad(): void {
  let contents: string
  try {
    contents = readFileSync(resolve(e2eRepositoryRoot, ".env"), "utf8")
  } catch (_error) {
    return
  }

  for (const line of contents.split("\n")) {
    const trimmed = line.trim()
    if (trimmed.length === 0 || trimmed.startsWith("#")) continue
    const separator = trimmed.indexOf("=")
    if (separator <= 0) continue
    const name = trimmed.slice(0, separator).trim()
    if (process.env[name] !== undefined) continue
    const raw = trimmed.slice(separator + 1).trim()
    const unquoted = /^(".*"|'.*')$/s.test(raw) ? raw.slice(1, -1) : raw
    process.env[name] = unquoted
  }
}
