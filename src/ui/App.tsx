import { A } from "@solidjs/router"
import type { JSX } from "solid-js"
import { For, Show } from "solid-js"
import { ButtonIcon } from "#ui/interactive/button/ButtonIcon.jsx"
import { ButtonIconOnly } from "#ui/interactive/button/ButtonIconOnly.jsx"
import { buttonCvaIconOnly, buttonSize, buttonVariant } from "#ui/interactive/button/buttonCva.js"
import { Icon } from "#ui/static/icon/Icon.jsx"
import { Img } from "#ui/static/img/Img.jsx"
import { AccountPopover } from "../identity/ui/AccountPopover.js"
import type { AuthShellView } from "../identity/ui/authShellView.js"
import { applicationIcon } from "./applicationIcon.js"
import { applicationNavigationContext } from "./applicationNavigationContext.js"
import { applicationShellContext } from "./applicationShellContext.js"
import type { applicationShellStateCreate } from "./applicationShellStateCreate.js"
import { appShellContext } from "./appShellContext.js"
import type { AppShellView } from "./appShellView.js"
import { ConnectionStatusIndicator } from "./ConnectionStatusIndicator.js"
import { urlDashboard } from "./dashboard_url/urlDashboard.js"
import { primaryNavigationStateCreate } from "./primaryNavigationStateCreate.js"
import { PwaStatusActions } from "./pwa/PwaStatusActions.js"
import { pwaStatusContext } from "./pwa/pwaStatusContext.js"
import { sessionDrawerContext } from "./sessionDrawerContext.js"
import { urlSettings } from "./settings_url/urlSettings.js"

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
            class="z-10 grid grid-cols-[minmax(220px,max-content)_minmax(0,1fr)_auto] items-center gap-4 bg-[var(--header-background)] px-4 backdrop-blur-[18px] max-[760px]:min-h-[52px] max-[760px]:grid-cols-[1fr_auto] max-[760px]:gap-2 max-[760px]:px-2 max-[760px]:py-2"
            inert={navigation.sessionDrawer.isSessionDrawerOpen()}
          >
            <div class="flex items-center gap-2">
              <A
                class="inline-flex w-fit items-center no-underline"
                href={urlDashboard()}
                aria-label="Codeline workspace"
              >
                <Img
                  src="/logo.svg"
                  alt=""
                  width={32}
                  height={32}
                  class="size-8 rounded-[9px] border border-[var(--border)]"
                />
              </A>
              <Show when={navigation.workspaceActions.isAvailable()}>
                <div class="flex items-center gap-0.5">
                  <ButtonIcon
                    icon={applicationIcon.sessionCreate}
                    iconClass="size-4 fill-current dark:fill-current"
                    size={buttonSize.sm}
                    variant={buttonVariant.contrast}
                    title="New session"
                    aria-label="New session"
                    onClick={navigation.workspaceActions.sessionNew}
                  >
                    New session
                  </ButtonIcon>
                  <ButtonIconOnly
                    icon={applicationIcon.projectCreate}
                    iconClass="size-4 fill-current dark:fill-current"
                    variant={buttonVariant.ghost}
                    title="New project"
                    aria-label="New project"
                    onClick={navigation.workspaceActions.projectCreateOpen}
                  />
                  <ButtonIconOnly
                    icon={applicationIcon.folderCreate}
                    iconClass="size-4 fill-current dark:fill-current"
                    variant={buttonVariant.ghost}
                    title="New folder"
                    aria-label="New folder"
                    onClick={navigation.workspaceActions.folderCreateOpen}
                  />
                </div>
              </Show>
            </div>

            <nav
              class="flex h-full min-w-0 items-stretch gap-1 overflow-x-auto max-[760px]:col-span-full max-[760px]:row-start-2 max-[760px]:h-9"
              aria-label="Primary navigation"
            >
              <For each={navigation.items}>
                {(item) => (
                  <A
                    aria-controls={item.controls}
                    aria-expanded={item.expanded?.()}
                    class="flex items-center gap-2 rounded-md px-[11px] text-[13px] no-underline transition-colors duration-150 hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]"
                    classList={{
                      "bg-[var(--surface-hover)] text-[var(--foreground)]": item.isActive(),
                      "text-[var(--muted-foreground)]": !item.isActive(),
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
                  navigation.settingsIsActive() && "bg-surface-hover text-foreground",
                )}
                href={urlSettings()}
                title="Settings"
                aria-label="Settings"
              >
                <Icon path={applicationIcon.settings} class="size-4 fill-current dark:fill-current" />
              </A>
              <ConnectionStatusIndicator state={props.state.connection} />
              <PwaStatusActions placement="shell" state={props.state.pwa} />
              <Show when={props.applicationShell?.rightPanelAvailable() ? props.applicationShell : undefined}>
                {(shell) => (
                  <ButtonIconOnly
                    icon={applicationIcon.rightPanel}
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
            <applicationNavigationContext.Provider value={navigation}>
              <sessionDrawerContext.Provider value={navigation.sessionDrawer}>
                {props.children}
              </sessionDrawerContext.Provider>
            </applicationNavigationContext.Provider>
          </appShellContext.Provider>
        </div>
      </pwaStatusContext.Provider>
    </applicationShellContext.Provider>
  )
}
