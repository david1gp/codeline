import { loginPageStateCreate } from "./loginPageStateCreate.js"

export function LoginPage() {
  const state = loginPageStateCreate()

  return (
    <main class="grid min-h-screen place-items-center bg-[var(--background)] px-6 py-12">
      <div class="w-full max-w-sm rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
        <h1 class="font-semibold text-[var(--foreground)] text-lg">Sign in to Codeline</h1>
        <p class="mt-2 text-[13px] text-[var(--muted-foreground)]">
          Codeline needs an authenticated session before the workspace can load.
        </p>
        <a
          class="mt-6 inline-flex w-full items-center justify-center rounded-lg border border-[var(--accent)] bg-[var(--accent-soft)] px-4 py-2 font-medium text-[13px] text-[var(--accent)] no-underline"
          href={state.loginHref()}
          rel="nofollow"
          target="_self"
        >
          Continue to sign in
        </a>
      </div>
    </main>
  )
}
