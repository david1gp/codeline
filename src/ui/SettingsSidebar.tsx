import { A } from "@solidjs/router"
import { For } from "solid-js"
import { Icon } from "#ui/static/icon/Icon.jsx"
import { applicationIcon } from "./applicationIcon.js"
import type { SettingsSection } from "./settingsSectionSchema.js"
import { urlSettings } from "./settings_url/urlSettings.js"

const groups = [
  { items: [{ icon: applicationIcon.settings, label: "General", section: "general" }], label: "Workspace" },
  {
    items: [
      { icon: applicationIcon.account, label: "Subagents", section: "subagents" },
      { icon: applicationIcon.projectCreate, label: "Skills", section: "skills" },
      { icon: applicationIcon.promptContext, label: "Commands", section: "commands" },
    ],
    label: "Configuration",
  },
] as const

export function SettingsSidebar(props: { activeSection: SettingsSection }) {
  return (
    <aside class="border-line border-r bg-surface max-[760px]:border-r-0 max-[760px]:border-b" aria-label="Settings">
      <div class="sticky top-0 grid gap-5 p-3 max-[760px]:static max-[760px]:flex max-[760px]:gap-3 max-[760px]:overflow-x-auto">
        <For each={groups}>
          {(group) => (
            <section class="min-w-fit">
              <h2 class="m-0 px-2 py-1 font-mono text-[10px] tracking-[0.1em] text-faint uppercase">{group.label}</h2>
              <nav class="grid gap-1 max-[760px]:flex" aria-label={`${group.label} settings`}>
                <For each={group.items}>
                  {(item) => (
                    <A
                      class="flex h-8 items-center gap-2 rounded-md px-2 text-xs no-underline transition-colors hover:bg-surface-hover hover:text-foreground"
                      classList={{
                        "bg-accent-soft font-medium text-accent": props.activeSection === item.section,
                        "text-faint": props.activeSection !== item.section,
                      }}
                      href={urlSettings(item.section)}
                      aria-current={props.activeSection === item.section ? "page" : undefined}
                    >
                      <Icon path={item.icon} class="size-4 shrink-0 fill-current dark:fill-current" />
                      <span>{item.label}</span>
                    </A>
                  )}
                </For>
              </nav>
            </section>
          )}
        </For>
      </div>
    </aside>
  )
}
