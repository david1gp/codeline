import { mdiCogOutline, mdiDockRight } from "@mdi/js"
import { A } from "@solidjs/router"
import type { JSX } from "solid-js"
import { For, Show } from "solid-js"
import { ButtonIconOnly } from "#ui/interactive/button/ButtonIconOnly.jsx"
import { buttonCvaIconOnly, buttonVariant } from "#ui/interactive/button/buttonCva.js"
import { Icon } from "#ui/static/icon/Icon.jsx"
import { AccountPopover } from "../identity/ui/AccountPopover.js"
import type { AuthShellView } from "../identity/ui/authShellView.js"
import { applicationShellContext } from "./applicationShellContext.js"
import type { applicationShellStateCreate } from "./applicationShellStateCreate.js"
import { appShellContext } from "./appShellContext.js"
import type { AppShellView } from "./appShellView.js"
import { PwaStatusActions } from "./pwa/PwaStatusActions.js"
import { pwaStatusContext } from "./pwa/pwaStatusContext.js"
import { primaryNavigationStateCreate } from "./primaryNavigationStateCreate.js"
import { sessionDrawerContext } from "./sessionDrawerContext.js"

export function App(props: {
  applicationShell?: ReturnType<typeof applicationShellStateCreate>
  auth?: AuthShellView
  children: JSX.Element
  state: AppShellView
}) {
  const navigation = primaryNavigationStateCreate()

  return (
    <applicationShellContext.Provider value={props.applicationShell}>
      <pwaStatusContext.Provider value={props.state.pwa}>
        <div class="grid h-screen min-h-screen grid-rows-[52px_minmax(0,1fr)] max-[760px]:h-auto max-[760px]:grid-rows-[auto_minmax(0,1fr)]">
          <header
            class="z-10 grid grid-cols-[220px_1fr_auto] items-center gap-4 border-[var(--border)] border-b bg-[var(--header-background)] px-4 backdrop-blur-[18px] max-[760px]:min-h-[52px] max-[760px]:grid-cols-[1fr_auto] max-[760px]:gap-2 max-[760px]:px-2 max-[760px]:py-2"
            inert={navigation.sessionDrawer.isSessionDrawerOpen()}
          >
            <A
              class="inline-flex w-fit items-center gap-2 font-semibold tracking-[-0.02em] no-underline"
              href="/"
              aria-label="Codeline workspace"
            >
              <span
                class="grid size-8 place-items-center rounded-[9px] border border-[var(--accent)] bg-[var(--accent-soft)] font-mono text-xs text-[var(--accent)] shadow-[inset_0_0_18px_var(--emblem-glow)]"
                aria-hidden="true"
              >
                C/
              </span>
              <span class="max-[480px]:sr-only">Codeline</span>
            </A>

            <nav
              class="flex h-full min-w-0 items-stretch gap-1 overflow-x-auto max-[760px]:col-span-full max-[760px]:row-start-2 max-[760px]:h-9"
              aria-label="Primary navigation"
            >
              <For each={navigation.items}>
                {(item) => (
                  <A
                    aria-controls={item.controls}
                    aria-expanded={item.expanded?.()}
                    class="flex items-center gap-2 border-b-2 px-[11px] text-[13px] no-underline transition-colors duration-150 hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]"
                    classList={{
                      "border-[var(--accent)] text-[var(--foreground)]": item.isActive(),
                      "border-transparent text-[var(--muted-foreground)]": !item.isActive(),
                    }}
                    href={item.href()}
                    onClick={item.activate}
                    title={item.label}
                  >
                    <Icon path={item.icon} class="size-4 fill-current dark:fill-current" />
                    <span class="max-[480px]:sr-only">{item.label}</span>
                  </A>
                )}
              </For>
            </nav>

            <div class="flex items-center gap-1 max-[760px]:col-start-2 max-[760px]:row-start-1">
              <Show when={props.auth}>{(auth) => <AccountPopover auth={auth()} />}</Show>
              <A
                class={buttonCvaIconOnly(
                  buttonVariant.ghost,
                  false,
                  false,
                  navigation.settingsIsActive() && "bg-slate-100 dark:bg-slate-800",
                )}
                href="/settings"
                title="Settings"
                aria-label="Settings"
              >
                <Icon path={mdiCogOutline} class="size-4 fill-current dark:fill-current" />
              </A>
              <PwaStatusActions placement="shell" state={props.state.pwa} />
              <Show when={props.applicationShell?.rightPanelAvailable() ? props.applicationShell : undefined}>
                {(shell) => (
                  <ButtonIconOnly
                    icon={mdiDockRight}
                    variant={buttonVariant.ghost}
                    classList={{ "bg-surface-hover text-foreground": shell().rightPanelOpen() }}
                    title={shell().rightPanelOpen() ? "Close right panel" : "Open right panel"}
                    aria-label={shell().rightPanelOpen() ? "Close right panel" : "Open right panel"}
                    aria-controls={shell().rightPanelOpen() ? "workspace-right-panel" : undefined}
                    aria-expanded={shell().rightPanelOpen()}
                    onClick={shell().rightPanelToggle}
                  />
                )}
              </Show>
            </div>
          </header>

          <appShellContext.Provider value={props.state}>
            <sessionDrawerContext.Provider value={navigation.sessionDrawer}>
              {props.children}
            </sessionDrawerContext.Provider>
          </appShellContext.Provider>
        </div>
      </pwaStatusContext.Provider>
    </applicationShellContext.Provider>
  )
}
