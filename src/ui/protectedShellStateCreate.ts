import { useNavigate } from "@solidjs/router"
import { useZero } from "@rocicorp/zero/solid"
import { authLogoutStateCreate } from "../identity/ui/authLogoutStateCreate.js"
import type { AuthShellView } from "../identity/ui/authShellView.js"

type ProtectedShellStateOptions = {
  displayName: () => string
  sessionClear: () => void
  userId: () => string
}

export function protectedShellStateCreate(options: ProtectedShellStateOptions): AuthShellView {
  const navigate = useNavigate()
  const zero = useZero()
  const logout = authLogoutStateCreate({
    navigateToLogin: () => navigate("/login", { replace: true }),
    sessionClear: options.sessionClear,
    zero: () => zero() as unknown as { delete: () => Promise<unknown> } | undefined,
  })

  return {
    busy: logout.busy,
    displayName: options.displayName,
    logout: logout.logout,
    userId: options.userId,
  }
}
