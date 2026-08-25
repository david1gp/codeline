import { LinkButtonExternal } from "#ui/interactive/link/LinkButton.jsx"
import { loginPageStateCreate } from "./loginPageStateCreate.js"

export function LoginPage() {
  const state = loginPageStateCreate()

  return (
    <main class="grid min-h-screen place-items-center bg-[var(--background)] px-6 py-12">
      <div class="w-full max-w-sm rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
        <h1 class="font-semibold text-[var(--foreground)] text-lg">Sign in to Codeline</h1>
        <p class="mt-2 text-[13px] text-[var(--muted-foreground)]">
          Continue with Authworks SSO at authworks.contentoren.de. You will return to Codeline after signing in.
        </p>
        <LinkButtonExternal class="mt-6 w-full" href={state.loginHref()} rel="nofollow" target="_self">
          Continue with Authworks SSO
        </LinkButtonExternal>
      </div>
    </main>
  )
}
