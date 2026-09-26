/// <reference lib="webworker" />
import { pwaServiceWorkerFetchHandle } from "./pwaServiceWorkerFetchHandle.js"
import { pwaServiceWorkerSkipWaitingMessage } from "./pwaServiceWorkerUpdateApply.js"

const worker = self as unknown as ServiceWorkerGlobalScope

const shellCacheName = "codeline-shell-v3"
const precachedPaths = [
  "/",
  "/manifest.webmanifest",
  "/favicon.ico",
  "/logo.svg",
  "/logo/codeline-icon-192.png",
  "/logo/codeline-icon-512.png",
  "/logo/codeline-icon-maskable-512.png",
]

worker.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(shellCacheName)
      await cache.addAll(precachedPaths).catch(() => undefined)
    })(),
  )
})

worker.addEventListener("message", (event) => {
  const data = event.data as { type?: unknown } | undefined
  if (!data || data.type !== pwaServiceWorkerSkipWaitingMessage) return
  void worker.skipWaiting()
})

worker.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys()
      await Promise.all(names.filter((name) => name !== shellCacheName).map((name) => caches.delete(name)))
      await worker.clients.claim()
    })(),
  )
})

worker.addEventListener("fetch", (event) => {
  const response = pwaServiceWorkerFetchHandle(event.request, {
    caches: {
      match: (request, options) => caches.match(request, options as CacheQueryOptions),
      open: (cacheName) => caches.open(cacheName),
    },
    fetch: (request) => worker.fetch(request),
    scopeOrigin: worker.location.origin,
    shellCacheName,
  })
  if (response) event.respondWith(response)
})
