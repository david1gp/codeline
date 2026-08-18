import { randomBytes } from "node:crypto"

/**
 * Creates the lowercase alphanumeric run identifier that makes every synthetic
 * identity, conversation title, and idempotency key of one run unique, so two
 * runs never collide and cleanup can target a single run.
 */
export function e2eRunIdCreate(): string {
  return `r${randomBytes(8).toString("hex")}`
}
