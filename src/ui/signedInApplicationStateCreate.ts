import { onCleanup } from "solid-js"
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
  const state = appShellStateCreate()
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
    reconciliation: eventFeedReconciliationCreate({ fetch: fetcher }),
  })

  onCleanup(eventFeed.close)

  return { applicationShell: shell, auth, eventFeed, state }
}
