import type { ConvexClient } from "convex/browser"
import { convexClientCreate } from "./convexClientCreate.js"
import { convexPublicUrlResult } from "./env/convexPublicUrlResult.js"

export function codelineConvexProviderStateCreate(token?: string): {
  client: ConvexClient | undefined
  token: string | undefined
} {
  if (token === undefined || token.length === 0) return { client: undefined, token: undefined }
  const url = convexPublicUrlResult()
  if (!url.success) {
    console.error(url.errorMessage)
    return { client: undefined, token: undefined }
  }

  const client = convexClientCreate(url.data)
  if (!client.success) {
    console.error(client.errorMessage)
    return { client: undefined, token: undefined }
  }

  return { client: client.data, token }
}
