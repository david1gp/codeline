import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"

type ConvexServerEnvironment = {
  readonly CONVEX_SELF_HOSTED_ADMIN_KEY: string
  readonly CONVEX_SELF_HOSTED_URL: string
}

type ConvexServerEnvironmentInput = {
  readonly CONVEX_SELF_HOSTED_ADMIN_KEY?: string
  readonly CONVEX_SELF_HOSTED_URL?: string
}

export function convexServerEnvironmentResult(
  environment: ConvexServerEnvironmentInput = {
    CONVEX_SELF_HOSTED_ADMIN_KEY: Bun.env.CONVEX_SELF_HOSTED_ADMIN_KEY,
    CONVEX_SELF_HOSTED_URL: Bun.env.CONVEX_SELF_HOSTED_URL,
  },
): Result<ConvexServerEnvironment> {
  const op = "convexServerEnvironmentResult"
  const parsedUrl = v.safeParse(v.pipe(v.string(), v.minLength(1), v.url()), environment.CONVEX_SELF_HOSTED_URL)
  if (!parsedUrl.success) return createResultError(op, "CONVEX_SELF_HOSTED_URL is missing or invalid.")

  const url = new URL(parsedUrl.output)
  if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username !== "" || url.password !== "") {
    return createResultError(op, "CONVEX_SELF_HOSTED_URL is invalid.")
  }

  const parsedAdminKey = v.safeParse(v.pipe(v.string(), v.minLength(1)), environment.CONVEX_SELF_HOSTED_ADMIN_KEY)
  if (!parsedAdminKey.success) return createResultError(op, "CONVEX_SELF_HOSTED_ADMIN_KEY is missing or invalid.")

  return createResult({
    CONVEX_SELF_HOSTED_ADMIN_KEY: parsedAdminKey.output,
    CONVEX_SELF_HOSTED_URL: url.toString(),
  })
}
