import { Badge } from "@adaptive-ds/solid-ui/static/badge/Badge"
import { appStateCreate } from "./appStateCreate.js"
import { SelectedSession } from "./SelectedSession.js"
import { SessionList } from "./SessionList.js"
import { sessionNavigationStateCreate } from "./sessionNavigationStateCreate.js"
import { ZeroConnectionIndicator } from "./ZeroConnectionIndicator.js"

export function App() {
  const state = appStateCreate()
  const sessionNavigation = sessionNavigationStateCreate()

  return (
    <div class="grid h-screen min-h-screen grid-rows-[64px_minmax(0,1fr)] max-[760px]:h-auto max-[760px]:grid-rows-[auto_minmax(0,1fr)]">
      <header class="z-10 grid grid-cols-[240px_1fr_auto] items-center gap-6 border-[#30342a] border-b bg-[rgb(17_19_15_/_88%)] px-6 backdrop-blur-[18px] max-[760px]:min-h-[62px] max-[760px]:grid-cols-[1fr_auto] max-[760px]:gap-3 max-[760px]:px-4 max-[760px]:py-2">
        <a
          class="inline-flex w-fit items-center gap-2.5 font-semibold tracking-[-0.02em] no-underline"
          href="#workspace"
          aria-label="Codeline workspace"
        >
          <span
            class="grid size-8 place-items-center rounded-[9px] border border-[#768d3d] bg-[#2b341c] font-mono text-xs text-[#d8ff72] shadow-[inset_0_0_18px_rgb(216_255_114_/_7%)]"
            aria-hidden="true"
          >
            C/
          </span>
          <span>Codeline</span>
        </a>

        <nav
          class="flex items-center gap-1 max-[760px]:col-span-full max-[760px]:row-start-2 max-[760px]:mx-[-4px]"
          aria-label="Primary navigation"
        >
          <a
            class="rounded-[7px] bg-[#1c1f19] px-[11px] py-[7px] text-[13px] text-[#ebece5] no-underline"
            href="#workspace"
            aria-current="page"
          >
            Workspace
          </a>
          <a
            class="rounded-[7px] px-[11px] py-[7px] text-[13px] text-[#969b8d] no-underline transition-colors duration-150 hover:bg-[#1c1f19] hover:text-[#ebece5]"
            href="#activity"
          >
            Activity
          </a>
        </nav>

        <div class="flex items-center gap-2 max-[760px]:gap-1.5">
          <ZeroConnectionIndicator />
          <Badge
            variant={state.healthVariant()}
            class="gap-[7px] border-[#30342a] px-2.5 py-[5px] text-xs"
            role="status"
            aria-live="polite"
          >
            <span class="size-1.5 rounded-full bg-current shadow-[0_0_10px_currentColor]" aria-hidden="true" />
            {state.healthLabel()}
          </Badge>
        </div>
      </header>

      <main class="grid min-h-0 grid-cols-[264px_minmax(0,1fr)] max-[760px]:block" id="workspace">
        <aside
          class="flex min-h-0 flex-col border-[#30342a] border-r bg-[rgb(23_25_20_/_76%)] px-[22px] pt-[30px] pb-5 max-[760px]:hidden"
          aria-label="Workspace navigation"
        >
          <div>
            <p class="mb-[9px] font-mono text-[10px] font-bold tracking-[0.14em] text-[#d8ff72] uppercase">Workspace</p>
            <h1 class="m-0 text-[19px] font-semibold tracking-[-0.02em]">Local session</h1>
            <p class="mt-2 mb-0 text-[13px] leading-[1.55] text-[#969b8d]">No project or conversation is open.</p>
          </div>

          <SessionList navigation={sessionNavigation} />

          <div class="flex items-center justify-between gap-3 font-mono text-[10px] text-[#686d61]">
            <span class="shortcut">Zero-synced foundation</span>
            <span class="version">v0.1</span>
          </div>
        </aside>

        <section
          class="grid min-w-0 min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] max-[760px]:min-h-[calc(100dvh-110px)]"
          aria-label="Conversation workspace"
        >
          <div
            class="flex min-h-[74px] items-center gap-[18px] border-[#25281f] border-b px-7 py-3 max-[760px]:items-stretch max-[760px]:gap-[9px] max-[760px]:overflow-x-auto max-[760px]:px-4"
            aria-label="Session controls"
          >
            <label class="relative grid grid-cols-[auto_minmax(130px,auto)_auto] items-center gap-[9px] text-[11px] font-semibold tracking-[0.06em] text-[#969b8d] uppercase max-[760px]:min-w-max max-[760px]:grid-cols-[auto_auto] max-[760px]:grid-rows-[auto_auto]">
              <span>Server</span>
              <select
                class="min-w-40 appearance-none rounded-[7px] border border-[#30342a] bg-[#1c1f19] px-2.5 py-2 text-xs font-normal tracking-normal text-[#8d9285] normal-case max-[760px]:col-span-full max-[760px]:row-start-2 max-[760px]:min-w-44"
                disabled
                aria-describedby="server-upcoming"
              >
                <option>Local server</option>
              </select>
              <small
                class="rounded-full bg-[#2b341c] px-1.5 py-[3px] text-[8px] font-normal tracking-[0.08em] text-[#b9d862]"
                id="server-upcoming"
              >
                Upcoming
              </small>
            </label>

            <span class="h-7 w-px bg-[#30342a] max-[760px]:h-auto" aria-hidden="true" />

            <label class="relative grid grid-cols-[auto_minmax(130px,auto)_auto] items-center gap-[9px] text-[11px] font-semibold tracking-[0.06em] text-[#969b8d] uppercase max-[760px]:min-w-max max-[760px]:grid-cols-[auto_auto] max-[760px]:grid-rows-[auto_auto]">
              <span>Agent</span>
              <select
                class="min-w-40 appearance-none rounded-[7px] border border-[#30342a] bg-[#1c1f19] px-2.5 py-2 text-xs font-normal tracking-normal text-[#8d9285] normal-case max-[760px]:col-span-full max-[760px]:row-start-2 max-[760px]:min-w-44"
                disabled
                aria-describedby="agent-upcoming"
              >
                <option>No agent configured</option>
              </select>
              <small
                class="justify-self-end rounded-full bg-[#2b341c] px-1.5 py-[3px] text-[8px] font-normal tracking-[0.08em] text-[#b9d862]"
                id="agent-upcoming"
              >
                Upcoming
              </small>
            </label>
          </div>

          <SelectedSession navigation={sessionNavigation} />
        </section>
      </main>
    </div>
  )
}
