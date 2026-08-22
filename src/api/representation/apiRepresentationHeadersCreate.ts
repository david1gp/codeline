import type { ApiEtag } from "../schema/apiEtagSchema.js"

export function apiRepresentationHeadersCreate(etag: ApiEtag): Headers {
  const headers = new Headers()
  headers.set("Cache-Control", "private, no-cache")
  headers.set("ETag", etag)
  headers.set("Vary", "Cookie, Accept-Encoding")
  return headers
}
