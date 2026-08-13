import { SessionList } from "./SessionList.js"
import { SelectedSession } from "./SelectedSession.js"
import { sessionNavigationStateCreate } from "./sessionNavigationStateCreate.js"

export function WorkspacePage() {
  const navigation = sessionNavigationStateCreate()

  return (
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

        <SessionList navigation={navigation} />

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

        <SelectedSession navigation={navigation} />
      </section>
    </main>
  )
}
