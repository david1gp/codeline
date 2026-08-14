import { serveStatic } from "hono/bun"
import type { App } from "../api/appEnvironment.js"
import { appKnownRouteResolve } from "./appKnownRouteResolve.js"

export function appUiShellFallbackAdd(app: App, shellPath: string): void {
  const serveShell = serveStatic({ path: shellPath })

  app.get("*", async (context, next) => {
    if (!appKnownRouteResolve(new URL(context.req.url).pathname)) return next()
    return serveShell(context, next)
  })
}
