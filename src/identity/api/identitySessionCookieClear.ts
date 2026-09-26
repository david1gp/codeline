import type { Context } from "hono"
import { setCookie } from "hono/cookie"
import type { AppEnvironment } from "../../api/appEnvironment.js"
import { identitySessionCookieName } from "./identitySessionCookieName.js"

export function identitySessionCookieClear(context: Context<AppEnvironment>): void {
  setCookie(context, identitySessionCookieName, "", {
    expires: new Date(0),
    httpOnly: true,
    maxAge: 0,
    path: "/",
    sameSite: "Lax",
    secure: true,
  })
}
