/// <reference lib="webworker" />
import { pwaShellRequestCacheable } from "./pwaShellRequestCacheable.js"

const worker = self as unknown as ServiceWorkerGlobalScope

const shellCacheName = "codeline-shell-v1"
const precachedPaths = [
  "/",
  "/manifest.webmanifest",
  "/favicon.ico",
  "/icons/codeline-icon-192.png",
  "/icons/codeline-icon-512.png",
  "/icons/codeline-icon-maskable-512.png",
]

worker.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(shellCacheName)
      await cache.addAll(precachedPaths).catch(() => undefined)
      await worker.skipWaiting()
    })(),
  )
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
  const request = event.request

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request)
        } catch {
          const cached = await caches.match("/", { cacheName: shellCacheName })
          if (cached) return cached
          return new Response("Codeline is offline.", { status: 503, headers: { "content-type": "text/plain" } })
        }
      })(),
    )
    return
  }

  if (!pwaShellRequestCacheable(request, worker.location.origin)) return

  event.respondWith(
    (async () => {
      const cached = await caches.match(request, { cacheName: shellCacheName })
      if (cached) return cached

      const response = await fetch(request)
      if (response.ok && response.type === "basic") {
        const cache = await caches.open(shellCacheName)
        await cache.put(request, response.clone())
      }
      return response
    })(),
  )
})
