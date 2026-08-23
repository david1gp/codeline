import type { JSX } from "solid-js"
import { Match, Switch } from "solid-js"
import { authSessionStateCreate } from "../identity/ui/authSessionStateCreate.js"
import { App } from "./App.js"
import { apiFetchContext } from "./apiFetchContext.js"
import { eventFeedCoordinatorContext } from "./eventFeedCoordinatorContext.js"
import { signedInApplicationStateCreate } from "./signedInApplicationStateCreate.js"

export function ApplicationRoot(props: { children?: JSX.Element }) {
  const fetcher = fetch
  const session = authSessionStateCreate({ fetcher })

  return (
    <apiFetchContext.Provider value={fetcher}>
      <Switch>
        <Match when={session.status() === "loading"}>
          <main class="grid min-h-screen place-items-center px-6 py-12" aria-busy="true">
            <p class="text-[13px] text-[var(--muted-foreground)]" role="status">
              Checking your session…
            </p>
          </main>
        </Match>
        <Match when={session.status() === "error"}>
          <main class="grid min-h-screen place-items-center px-6 py-12">
            <div class="max-w-sm text-center" role="alert">
              <h1 class="font-semibold text-[var(--foreground)] text-lg">Session check failed</h1>
              <p class="mt-2 text-[13px] text-[var(--muted-foreground)]">
                Codeline could not confirm your session. Check your connection and try again.
              </p>
              <button
                class="mt-6 rounded-lg border border-[var(--border)] px-4 py-2 text-[13px]"
                type="button"
                onClick={session.retry}
              >
                Try again
              </button>
            </div>
          </main>
        </Match>
        <Match when={session.status() === "signed-out"}>
          <main class="grid min-h-screen place-items-center px-6 py-12">
            <div class="max-w-sm text-center">
              <h1 class="font-semibold text-[var(--foreground)] text-lg">Sign in required</h1>
              <p class="mt-2 text-[13px] text-[var(--muted-foreground)]">Your Codeline session has ended.</p>
              <a class="mt-6 inline-block text-[13px] text-[var(--accent)]" href="/api/auth/login">
                Sign in with SSO
              </a>
            </div>
          </main>
        </Match>
        <Match
          when={
            session.status() === "signed-in" && session.userId() !== undefined && session.displayName() !== undefined
              ? {
                  displayName: session.displayName() as string,
                  userId: session.userId() as string,
                }
              : undefined
          }
          keyed
        >
          {(user) => (
            <ProtectedShell
              displayName={user.displayName}
              fetcher={fetcher}
              userId={user.userId}
              sessionClear={session.signOut}
            >
              {props.children}
            </ProtectedShell>
          )}
        </Match>
      </Switch>
    </apiFetchContext.Provider>
  )
}

function ProtectedShell(props: {
  children?: JSX.Element
  displayName: string
  fetcher: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  sessionClear: () => void
  userId: string
}) {
  const state = signedInApplicationStateCreate({
    displayName: () => props.displayName,
    fetch: props.fetcher,
    sessionClear: () => props.sessionClear(),
    userId: () => props.userId,
  })

  return (
    <eventFeedCoordinatorContext.Provider value={state.eventFeed}>
      <App applicationShell={state.applicationShell} auth={state.auth} state={state.state}>
        {props.children}
      </App>
    </eventFeedCoordinatorContext.Provider>
  )
}
