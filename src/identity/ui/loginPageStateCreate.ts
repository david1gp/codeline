import { useLocation } from "@solidjs/router"
import { authReturnPathResolve } from "./authReturnPathResolve.js"

/** Public login view state. It must not touch protected data requests. */
export function loginPageStateCreate() {
  const location = useLocation<{ returnTo?: string }>()
  const returnTo = () => authReturnPathResolve(location.query.returnTo as string | undefined)

  return {
    loginHref: () => `/api/auth/login?returnTo=${encodeURIComponent(returnTo())}`,
    returnTo,
  }
}
