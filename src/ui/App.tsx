import { A } from "@solidjs/router"
import type { JSX } from "solid-js"
import type { AppShellView } from "./appShellView.js"
import { ConnectionStatusIndicator } from "./ConnectionStatusIndicator.js"
import { PwaStatusActions } from "./pwa/PwaStatusActions.js"
import { ThemeSwitcher } from "./ThemeSwitcher.js"

export function App(props: { children: JSX.Element; state: AppShellView }) {
  return (
    <div class="grid h-screen min-h-screen grid-rows-[64px_minmax(0,1fr)] max-[760px]:h-auto max-[760px]:grid-rows-[auto_minmax(0,1fr)]">
      <header class="z-10 grid grid-cols-[240px_1fr_auto] items-center gap-6 border-[var(--border)] border-b bg-[var(--header-background)] px-6 backdrop-blur-[18px] max-[760px]:min-h-[62px] max-[760px]:grid-cols-[1fr_auto] max-[760px]:gap-3 max-[760px]:px-4 max-[760px]:py-2">
        <A
          class="inline-flex w-fit items-center gap-2.5 font-semibold tracking-[-0.02em] no-underline"
          href="/"
          aria-label="Codeline workspace"
        >
          <span
            class="grid size-8 place-items-center rounded-[9px] border border-[var(--accent)] bg-[var(--accent-soft)] font-mono text-xs text-[var(--accent)] shadow-[inset_0_0_18px_var(--emblem-glow)]"
            aria-hidden="true"
          >
            C/
          </span>
          <span>Codeline</span>
        </A>

        <nav
          class="flex items-center gap-1 max-[760px]:col-span-full max-[760px]:row-start-2 max-[760px]:mx-[-4px]"
          aria-label="Primary navigation"
        >
          <A
            class="rounded-[7px] px-[11px] py-[7px] text-[13px] no-underline hover:bg-[var(--surface-hover)]"
            activeClass="text-[var(--foreground)]"
            inactiveClass="text-[var(--muted-foreground)]"
            end
            href="/"
          >
            Workspace
          </A>
          <A
            class="rounded-[7px] px-[11px] py-[7px] text-[13px] no-underline transition-colors duration-150 hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]"
            activeClass="text-[var(--foreground)]"
            inactiveClass="text-[var(--muted-foreground)]"
            href="/files"
          >
            Files
          </A>
          <A
            class="rounded-[7px] px-[11px] py-[7px] text-[13px] text-[var(--muted-foreground)] no-underline transition-colors duration-150 hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]"
            href="#activity"
          >
            Activity
          </A>
        </nav>

        <div class="flex items-center gap-2 max-[760px]:gap-1">
          <A
            class="grid size-9 shrink-0 place-items-center rounded-lg border border-[var(--border)] text-[var(--muted-foreground)] no-underline hover:border-[var(--accent)] hover:text-[var(--accent)]"
            href="/notes"
            aria-label="Notes"
            title="Notes"
          >
            <svg
              aria-hidden="true"
              class="size-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
            >
              <path d="M6 3.75h9l3 3V20.25H6z" />
              <path d="M9 10h6M9 14h6M9 18h4" />
            </svg>
          </A>
          <ThemeSwitcher state={props.state.theme} />
          <PwaStatusActions state={props.state.pwa} />
          <ConnectionStatusIndicator state={props.state.connection} />
        </div>
      </header>

      {props.children}
    </div>
  )
}
