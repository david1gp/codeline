import { Badge } from "@adaptive-ds/solid-ui/static/badge/Badge"
import { A } from "@solidjs/router"
import type { JSX } from "solid-js"
import { appStateCreate } from "./appStateCreate.js"
import { PwaStatusIndicator } from "./pwa/PwaStatusIndicator.js"
import { ZeroConnectionIndicator } from "./ZeroConnectionIndicator.js"

export function App(props: { children: JSX.Element }) {
  const state = appStateCreate()

  return (
    <div class="grid h-screen min-h-screen grid-rows-[64px_minmax(0,1fr)] max-[760px]:h-auto max-[760px]:grid-rows-[auto_minmax(0,1fr)]">
      <header class="z-10 grid grid-cols-[240px_1fr_auto] items-center gap-6 border-[#30342a] border-b bg-[rgb(17_19_15_/_88%)] px-6 backdrop-blur-[18px] max-[760px]:min-h-[62px] max-[760px]:grid-cols-[1fr_auto] max-[760px]:gap-3 max-[760px]:px-4 max-[760px]:py-2">
        <A
          class="inline-flex w-fit items-center gap-2.5 font-semibold tracking-[-0.02em] no-underline"
          href="/"
          aria-label="Codeline workspace"
        >
          <span
            class="grid size-8 place-items-center rounded-[9px] border border-[#768d3d] bg-[#2b341c] font-mono text-xs text-[#d8ff72] shadow-[inset_0_0_18px_rgb(216_255_114_/_7%)]"
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
            class="rounded-[7px] px-[11px] py-[7px] text-[13px] no-underline hover:bg-[#1c1f19]"
            activeClass="text-[#ebece5]"
            inactiveClass="text-[#969b8d]"
            end
            href="/"
          >
            Workspace
          </A>
          <A
            class="rounded-[7px] px-[11px] py-[7px] text-[13px] no-underline transition-colors duration-150 hover:bg-[#1c1f19] hover:text-[#ebece5]"
            activeClass="text-[#ebece5]"
            inactiveClass="text-[#969b8d]"
            href="/files"
          >
            Files
          </A>
          <A
            class="rounded-[7px] px-[11px] py-[7px] text-[13px] text-[#969b8d] no-underline transition-colors duration-150 hover:bg-[#1c1f19] hover:text-[#ebece5]"
            href="#activity"
          >
            Activity
          </A>
        </nav>

        <div class="flex items-center gap-2 max-[760px]:gap-1">
          <A
            class="grid size-9 place-items-center rounded-lg border border-[#30342a] text-[#969b8d] no-underline hover:border-[#768d3d] hover:text-[#d8ff72]"
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
          <PwaStatusIndicator />
          <ZeroConnectionIndicator />
          <Badge
            variant={state.healthVariant()}
            class="gap-[7px] border-[#30342a] px-2.5 py-[5px] text-xs data-[state=connected]:bg-[#1f7047]"
            data-state={state.healthStatus()}
            role="status"
            aria-live="polite"
          >
            <span class="size-1.5 rounded-full bg-current shadow-[0_0_10px_currentColor]" aria-hidden="true" />
            {state.healthLabel()}
          </Badge>
        </div>
      </header>

      {props.children}
    </div>
  )
}
