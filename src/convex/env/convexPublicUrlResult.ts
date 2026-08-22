import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"

type ConvexPublicEnvironment = {
  readonly VITE_CONVEX_URL?: string
}

export function convexPublicUrlResult(environment: ConvexPublicEnvironment = import.meta.env): Result<string> {
  const op = "convexPublicUrlResult"
  const parsed = v.safeParse(v.pipe(v.string(), v.minLength(1), v.url()), environment.VITE_CONVEX_URL)
  if (!parsed.success) return createResultError(op, "VITE_CONVEX_URL is missing or invalid.")

  const url = new URL(parsed.output)
  if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username !== "" || url.password !== "") {
    return createResultError(op, "VITE_CONVEX_URL is invalid.")
  }

  return createResult(url.toString())
}
