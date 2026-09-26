import { randomBytes } from "node:crypto"

/**
 * Creates the lowercase alphanumeric run identifier that makes every synthetic
 * identity, conversation title, and idempotency key of one run unique, so two
 * runs never collide and cleanup can target a single run.
 */
export function e2eRunIdCreate(): string {
  // Every test owns a separate, unmistakably E2E-marked fixture run. Keep the
  // ID within the fixture API's 40-character limit, including in legacy mode.
  return `e2e${randomBytes(12).toString("hex")}`
}
