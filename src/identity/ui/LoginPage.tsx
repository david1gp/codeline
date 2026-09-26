import { For, Match, Show, Switch } from "solid-js"
import { LinkButtonExternal } from "#ui/interactive/link/LinkButton.jsx"
import { loginPageStateCreate } from "./loginPageStateCreate.js"

export function LoginPage() {
  const state = loginPageStateCreate()

  return (
    <main class="grid min-h-screen place-items-center bg-[var(--background)] px-6 py-12">
      <div class="w-full max-w-sm rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
        <h1 class="font-semibold text-[var(--foreground)] text-lg">Sign in to Codeline</h1>
        <p class="mt-2 text-[13px] text-[var(--muted-foreground)]">
          Choose your sign-in provider. You will return to Codeline after signing in.
        </p>
        <Switch>
          <Match when={state.status() === "loading"}>
            <p class="mt-6 text-[13px] text-[var(--muted-foreground)]" role="status" aria-busy="true">
              Loading sign-in providers…
            </p>
          </Match>
          <Match when={state.status() === "error"}>
            <p class="mt-6 text-[13px] text-[var(--muted-foreground)]" role="alert">
              Sign-in providers could not be loaded. Try again later.
            </p>
          </Match>
          <Match when={state.status() === "ready"}>
            <Show
              when={state.providers().length > 0}
              fallback={
                <p class="mt-6 text-[13px] text-[var(--muted-foreground)]">No sign-in providers are available.</p>
              }
            >
              <div class="mt-6 grid gap-3">
                <For each={state.providers()}>
                  {(provider) => (
                    <LinkButtonExternal
                      class="w-full"
                      href={state.loginHref(provider.id)}
                      rel="nofollow"
                      target="_self"
                    >
                      Continue with {provider.label} SSO
                    </LinkButtonExternal>
                  )}
                </For>
              </div>
            </Show>
          </Match>
        </Switch>
      </div>
    </main>
  )
}
