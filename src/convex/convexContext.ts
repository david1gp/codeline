import type { ConvexClient } from "convex/browser"
import { createContext } from "solid-js"

export type CodelineConvexContext = {
  client: ConvexClient
  organizationId?: string
  token: string
}

export const convexContext = createContext<CodelineConvexContext | undefined>()
