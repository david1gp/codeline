import { useLocation, useNavigate } from "@solidjs/router"
import { sessionSidebarRouteStateCreate } from "./sessionSidebarRouteStateCreate.js"
import { workspaceScreenStateCreate } from "./workspaceScreenStateCreate.js"

export function workspaceRoutePageStateCreate() {
  const location = useLocation()
  const navigate = useNavigate()
  const sidebarRoute = sessionSidebarRouteStateCreate({
    href: () => `${location.pathname}${location.search}${location.hash}`,
    navigate,
  })

  return workspaceScreenStateCreate(undefined, sidebarRoute)
}
