import type { Context } from "hono"
import { setCookie } from "hono/cookie"
import type { AppEnvironment } from "../../api/appEnvironment.js"
import { identitySessionCookieName } from "./identitySessionCookieName.js"

export function identitySessionCookieSet(
  context: Context<AppEnvironment>,
  token: string,
  expiresAt: Date,
  now: Date = new Date(),
): void {
  setCookie(context, identitySessionCookieName, token, {
    expires: expiresAt,
    httpOnly: true,
    maxAge: Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / 1000)),
    path: "/",
    sameSite: "Lax",
    secure: true,
  })
}
