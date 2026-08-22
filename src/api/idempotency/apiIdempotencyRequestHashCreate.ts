import { createHash } from "node:crypto"

export function apiIdempotencyRequestHashCreate(input: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(input) ?? "undefined", "utf8")
    .digest("hex")
}
