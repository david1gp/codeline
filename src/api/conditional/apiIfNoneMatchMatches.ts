import * as v from "valibot"
import { apiEtagSchema } from "../schema/apiEtagSchema.js"

export function apiIfNoneMatchMatches(header: string | undefined, etag: string): boolean {
  if (header === undefined) return false

  return header.split(",").some((value) => {
    const candidate = value.trim()
    if (candidate === "*") return true
    const strongCandidate = candidate.startsWith("W/") ? candidate.slice(2) : candidate
    return v.safeParse(apiEtagSchema, strongCandidate).success && strongCandidate === etag
  })
}
