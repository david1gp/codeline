import { onCleanup, onMount } from "solid-js"
import { applicationShellStateCreate } from "./applicationShellStateCreate.js"
import { appShellStateCreate } from "./appShellStateCreate.js"
import { eventFeedCoordinatorStateCreate } from "./eventFeedCoordinatorStateCreate.js"
import { eventFeedReconciliationCreate } from "./eventFeedReconciliationCreate.js"
import { protectedShellStateCreate } from "./protectedShellStateCreate.js"

type SignedInApplicationStateOptions = {
  displayName: () => string
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  sessionClear: () => void
  userId: () => string
}

export function signedInApplicationStateCreate(options: SignedInApplicationStateOptions) {
  const fetcher = options.fetch ?? fetch
  const state = appShellStateCreate({
    accountId: options.userId,
    fetch: fetcher,
  })
  const shell = applicationShellStateCreate()
  const auth = protectedShellStateCreate({
    displayName: options.displayName,
    sessionClear: options.sessionClear,
    userId: options.userId,
  })
  const eventFeed = eventFeedCoordinatorStateCreate({
    bootstrap: { fresh: true },
    connectionIndicator: state.events,
    eventSourceFactory: (url, eventSourceOptions) => new EventSource(url, eventSourceOptions),
    onAuthenticationError: options.sessionClear,
    reconciliation: eventFeedReconciliationCreate({ fetch: fetcher }),
  })

  onMount(() => {
    const browserOffline = () => eventFeed.offline()
    const browserOnline = () => eventFeed.online()
    window.addEventListener("offline", browserOffline)
    window.addEventListener("online", browserOnline)
    if (navigator.onLine === false) browserOffline()
    onCleanup(() => {
      window.removeEventListener("offline", browserOffline)
      window.removeEventListener("online", browserOnline)
    })
  })

  onCleanup(eventFeed.close)

  return { applicationShell: shell, auth, eventFeed, state }
}
