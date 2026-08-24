import { expect, test } from "bun:test"
import { providerAgentCatalogLoad } from "../src/providers/catalog/providerAgentCatalogLoad.js"
import { providerAgentCatalogRedact } from "../src/providers/catalog/providerAgentCatalogRedact.js"
import { providerCatalogFetch } from "../src/providers/client/providerCatalogFetch.js"

test("provider catalog fetch uses the typed integer revision and server ETag", async () => {
  const loaded = await providerAgentCatalogLoad(process.cwd())
  expect(loaded.success).toBe(true)
  if (!loaded.success) return
  const body = providerAgentCatalogRedact(loaded.data)
  let requestInit: RequestInit | undefined

  const result = await providerCatalogFetch({
    fetch: async (_input, init) => {
      requestInit = init
      return new Response(JSON.stringify(body), {
        headers: { ETag: '"catalog-1"' },
        status: 200,
      })
    },
  })

  expect(result.success).toBe(true)
  if (!result.success || result.data.status !== 200) return
  expect(result.data.revision).toBe(body.revision)
  expect(result.data.etag).toBe('"catalog-1"')
  expect(new Headers(requestInit?.headers).get("Accept")).toBe("application/json")
})

test("provider catalog fetch rejects a successful response without a server ETag", async () => {
  const result = await providerCatalogFetch({
    fetch: async () => new Response(JSON.stringify({ providers: [], revision: 1 }), { status: 200 }),
  })

  expect(result.success).toBe(false)
})

test("provider catalog fetch accepts 304 only with a cached representation", async () => {
  const notModified = await providerCatalogFetch({
    etag: '"catalog-1"',
    fetch: async () => new Response(null, { headers: { ETag: '"catalog-1"' }, status: 304 }),
  })
  expect(notModified).toEqual({ success: true, data: { status: 304 } })

  const missingCache = await providerCatalogFetch({ fetch: async () => new Response(null, { status: 304 }) })
  expect(missingCache.success).toBe(false)

  const missingEtag = await providerCatalogFetch({
    etag: '"catalog-1"',
    fetch: async () => new Response(null, { status: 304 }),
  })
  expect(missingEtag.success).toBe(false)
})
