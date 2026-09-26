import { pwaShellRequestCacheable } from "./pwaShellRequestCacheable.js"

type PwaServiceWorkerCache = {
  put: (request: Request, response: Response) => Promise<void>
}

type PwaServiceWorkerCaches = {
  match: (request: Request | string, options?: { cacheName?: string }) => Promise<Response | undefined>
  open: (cacheName: string) => Promise<PwaServiceWorkerCache>
}

type PwaServiceWorkerFetchDependencies = {
  caches: PwaServiceWorkerCaches
  fetch: (request: Request) => Promise<Response>
  scopeOrigin: string
  shellCacheName: string
}

export function pwaServiceWorkerFetchHandle(
  request: Request,
  dependencies: PwaServiceWorkerFetchDependencies,
): Promise<Response> | undefined {
  if (pwaServiceWorkerApiRequest(request, dependencies.scopeOrigin)) return dependencies.fetch(request)

  if (request.mode === "navigate") return pwaServiceWorkerNavigationResponse(request, dependencies)

  if (!pwaShellRequestCacheable(request, dependencies.scopeOrigin)) return undefined

  return pwaServiceWorkerShellResponse(request, dependencies)
}

function pwaServiceWorkerApiRequest(request: Request, scopeOrigin: string): boolean {
  const url = new URL(request.url)
  if (url.origin !== scopeOrigin) return false

  return url.pathname === "/api" || url.pathname.startsWith("/api/")
}

async function pwaServiceWorkerNavigationResponse(
  request: Request,
  dependencies: PwaServiceWorkerFetchDependencies,
): Promise<Response> {
  try {
    return await dependencies.fetch(request)
  } catch {
    const cached = await dependencies.caches.match("/", { cacheName: dependencies.shellCacheName })
    if (cached) return cached
    return new Response("Codeline is offline.", { status: 503, headers: { "content-type": "text/plain" } })
  }
}

async function pwaServiceWorkerShellResponse(
  request: Request,
  dependencies: PwaServiceWorkerFetchDependencies,
): Promise<Response> {
  const cached = await dependencies.caches.match(request, { cacheName: dependencies.shellCacheName })
  if (cached) return cached

  const response = await dependencies.fetch(request)
  if (response.ok && response.type === "basic") {
    const cache = await dependencies.caches.open(dependencies.shellCacheName)
    await cache.put(request, response.clone())
  }
  return response
}
