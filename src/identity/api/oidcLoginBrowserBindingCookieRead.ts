import type { Context } from "hono"
import { getCookie } from "hono/cookie"
import type { AppEnvironment } from "../../api/appEnvironment.js"
import { oidcLoginBrowserBindingCookieName } from "./oidcLoginBrowserBindingCookieName.js"

export function oidcLoginBrowserBindingCookieRead(context: Context<AppEnvironment>): string | undefined {
  return getCookie(context, oidcLoginBrowserBindingCookieName)
}
