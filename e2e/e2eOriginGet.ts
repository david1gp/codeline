/**
 * Resolves the Playwright target origin for the repository end-to-end run.
 * There is no default environment: the origin must be configured explicitly
 * (locally via the ignored `.env`, or per step from the suite checkpoint),
 * so an unset or malformed value throws before any browser request is made.
 */
export function e2eOriginGet(raw?: string, name?: string): string {
  const value = raw === undefined && name === undefined ? process.env.PUBLIC_ORIGIN : raw
  const variable = name ?? "PUBLIC_ORIGIN"
  const origin = value?.trim()
  if (origin === undefined || origin.length === 0)
    throw new Error(`${variable} is not set. There is no default environment.`)
  let parsed: URL
  try {
    parsed = new URL(origin)
  } catch {
    throw new Error(
      `${variable} must be an absolute http(s) origin without a path, got ${JSON.stringify(origin)}. There is no default environment.`,
    )
  }
  if ((parsed.protocol !== "http:" && parsed.protocol !== "https:") || parsed.origin !== origin)
    throw new Error(
      `${variable} must be an absolute http(s) origin without a path, got ${JSON.stringify(origin)}. There is no default environment.`,
    )
  return origin
}
