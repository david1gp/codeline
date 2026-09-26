import type { Context } from "hono"
import { getCookie } from "hono/cookie"
import type { AppEnvironment } from "../../api/appEnvironment.js"
import { identitySessionCookieName } from "./identitySessionCookieName.js"

export function identitySessionCookieRead(context: Context<AppEnvironment>): string | undefined {
  return getCookie(context, identitySessionCookieName)
}
