import { useLocation, useNavigate } from "@solidjs/router"
import { useContext } from "solid-js"
import { apiFetchContext } from "./apiFetchContext.js"
import { sessionNavigationStateCreate } from "./sessionNavigationStateCreate.js"
import { sessionSidebarRouteStateCreate } from "./sessionSidebarRouteStateCreate.js"
import { workspaceScreenStateCreate } from "./workspaceScreenStateCreate.js"

export function workspaceRoutePageStateCreate() {
  const fetcher = useContext(apiFetchContext)
  const location = useLocation()
  const navigate = useNavigate()
  const navigation = sessionNavigationStateCreate({
    location: {
      get href() {
        return `${window.location.origin}${location.pathname}${location.search}${location.hash}`
      },
    },
    history: window.history,
    navigate: (href) => navigate(href, { scroll: false }),
    addEventListener: (type, listener) => window.addEventListener(type, listener),
    removeEventListener: (type, listener) => window.removeEventListener(type, listener),
  })
  const sidebarRoute = sessionSidebarRouteStateCreate({
    href: () => `${location.pathname}${location.search}${location.hash}`,
    navigate,
  })

  return workspaceScreenStateCreate(navigation, sidebarRoute, { fetcher })
}
