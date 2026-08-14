import type { Context } from "hono"
import { setCookie } from "hono/cookie"
import type { AppEnvironment } from "../../api/appEnvironment.js"
import { oidcLoginBrowserBindingCookieName } from "./oidcLoginBrowserBindingCookieName.js"

export function oidcLoginBrowserBindingCookieClear(context: Context<AppEnvironment>): void {
  setCookie(context, oidcLoginBrowserBindingCookieName, "", {
    expires: new Date(0),
    httpOnly: true,
    maxAge: 0,
    path: "/",
    sameSite: "Lax",
    secure: true,
  })
}
