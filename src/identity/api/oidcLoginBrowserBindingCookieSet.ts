import type { Context } from "hono"
import { setCookie } from "hono/cookie"
import type { AppEnvironment } from "../../api/appEnvironment.js"
import { oidcLoginBrowserBindingCookieName } from "./oidcLoginBrowserBindingCookieName.js"

export function oidcLoginBrowserBindingCookieSet(
  context: Context<AppEnvironment>,
  binding: string,
  expiresAt: Date,
  now: Date,
): void {
  setCookie(context, oidcLoginBrowserBindingCookieName, binding, {
    expires: expiresAt,
    httpOnly: true,
    maxAge: Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / 1_000)),
    path: "/",
    sameSite: "Lax",
    secure: true,
  })
}
