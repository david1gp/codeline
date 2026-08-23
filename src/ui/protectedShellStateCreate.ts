import { useNavigate } from "@solidjs/router"
import { authLogoutStateCreate } from "../identity/ui/authLogoutStateCreate.js"
import type { AuthShellView } from "../identity/ui/authShellView.js"

type ProtectedShellStateOptions = {
  displayName: () => string
  sessionClear: () => void
  userId: () => string
}

export function protectedShellStateCreate(options: ProtectedShellStateOptions): AuthShellView {
  const navigate = useNavigate()
  const logout = authLogoutStateCreate({
    navigateToLogin: () => navigate("/login", { replace: true }),
    sessionClear: options.sessionClear,
  })

  return {
    busy: logout.busy,
    displayName: options.displayName,
    logout: logout.logout,
    userId: options.userId,
  }
}
