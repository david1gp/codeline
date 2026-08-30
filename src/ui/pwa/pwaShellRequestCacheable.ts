const staticPathPrefixes = ["/assets/", "/icons/"] as const
const staticPaths = ["/favicon.ico", "/logo.svg", "/manifest.webmanifest"] as const

export function pwaShellRequestCacheable(request: { method: string; url: string }, scopeOrigin: string): boolean {
  if (request.method !== "GET") return false

  let url: URL
  try {
    url = new URL(request.url)
  } catch {
    return false
  }

  if (url.origin !== scopeOrigin) return false
  if (url.protocol !== "http:" && url.protocol !== "https:") return false
  if (url.search !== "") return false

  if (staticPaths.some((path) => url.pathname === path)) return true

  return staticPathPrefixes.some((prefix) => url.pathname.startsWith(prefix))
}
