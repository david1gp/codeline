import { For, Match, Switch } from "solid-js"
import type { DemoSurfaceFixture } from "./demoSurfaceFixture.js"

export function DemoSurfacePanel(props: { fixture: DemoSurfaceFixture }) {
  return (
    <section
      class="min-h-0 flex-1 overflow-auto bg-surface-sunken p-4 text-foreground"
      aria-label={props.fixture.title}
      tabindex="0"
    >
      <div class="mx-auto max-w-3xl overflow-hidden rounded-xl border border-line bg-surface-raised shadow-[0_16px_45px_var(--shadow-color-strong)]">
        <header class="border-line border-b px-5 py-4">
          <div class="flex items-start justify-between gap-3">
            <div>
              <p class="m-0 font-mono text-[9px] tracking-[0.12em] text-accent uppercase">Configuration fixture</p>
              <h2 class="mt-1 mb-0 text-lg tracking-[-0.025em]">{props.fixture.title}</h2>
            </div>
            <span class="rounded-full bg-muted px-2 py-1 font-mono text-[9px] text-faint">local only</span>
          </div>
          <p class="mt-2 mb-0 text-xs leading-5 text-faint">{props.fixture.subtitle}</p>
        </header>

        <Switch>
          <Match when={props.fixture.kind === "models" && props.fixture}>
            {(fixture) => (
              <div class="divide-y divide-line-subtle">
                <For each={fixture().models}>
                  {(model) => (
                    <article class="grid grid-cols-[auto_1fr_auto] items-center gap-3 px-5 py-4">
                      <span
                        class="size-2 rounded-full"
                        classList={{ "bg-success-solid": model.enabled, "bg-disabled": !model.enabled }}
                      />
                      <div class="min-w-0">
                        <strong class="block truncate text-sm">{model.label}</strong>
                        <span class="font-mono text-[10px] text-faint">{model.provider}</span>
                      </div>
                      <div class="text-right font-mono text-[10px] text-faint">
                        <span class="block">{model.context} context</span>
                        <span>{model.reasoning} reasoning</span>
                      </div>
                    </article>
                  )}
                </For>
              </div>
            )}
          </Match>
          <Match when={props.fixture.kind === "skills" && props.fixture}>
            {(fixture) => (
              <div class="grid gap-3 p-4 sm:grid-cols-2">
                <For each={fixture().skills}>
                  {(skill) => (
                    <article class="rounded-lg border border-line p-3">
                      <div class="flex items-center gap-2">
                        <strong class="font-mono text-xs">/{skill.label}</strong>
                        <span class="ml-auto rounded bg-muted px-1.5 py-0.5 font-mono text-[9px]">{skill.scope}</span>
                      </div>
                      <p class="mb-3 text-xs leading-5 text-faint">{skill.description}</p>
                      <span
                        class="font-mono text-[9px]"
                        classList={{
                          "text-success": skill.status === "available",
                          "text-disabled": skill.status === "disabled",
                        }}
                      >
                        {skill.status}
                      </span>
                    </article>
                  )}
                </For>
              </div>
            )}
          </Match>
          <Match when={props.fixture.kind === "stats" && props.fixture}>
            {(fixture) => (
              <div class="p-5">
                <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <For each={fixture().metrics}>
                    {(metric) => (
                      <div class="rounded-lg bg-muted p-3">
                        <span class="block font-mono text-[9px] text-faint uppercase">{metric.label}</span>
                        <strong class="mt-1 block text-sm">{metric.value}</strong>
                      </div>
                    )}
                  </For>
                </div>
                <div class="mt-5 grid gap-4">
                  <For each={fixture().usage}>
                    {(usage) => (
                      <div>
                        <div class="mb-1 flex justify-between font-mono text-[10px]">
                          <span>{usage.label}</span>
                          <span class="text-faint">{usage.value}</span>
                        </div>
                        <div class="h-2 overflow-hidden rounded-full bg-line-subtle">
                          <span class="block h-full rounded-full bg-accent" style={{ width: `${usage.percent}%` }} />
                        </div>
                      </div>
                    )}
                  </For>
                </div>
              </div>
            )}
          </Match>
          <Match when={props.fixture.kind === "system-prompt" && props.fixture}>
            {(fixture) => (
              <div class="p-4">
                <div class="mb-3 flex flex-wrap gap-2">
                  <For each={fixture().sources}>
                    {(source) => (
                      <span class="rounded-md border border-line px-2 py-1 font-mono text-[9px]">
                        <strong>{source.label}</strong> · {source.status}
                      </span>
                    )}
                  </For>
                </div>
                <pre
                  tabindex="0"
                  class="m-0 overflow-x-auto rounded-lg bg-[var(--code-background)] p-4 font-mono text-[11px] leading-6 text-foreground"
                >
                  <For each={fixture().lines}>
                    {(line, index) => (
                      <code class="block">
                        <span class="mr-3 text-faint">{String(index() + 1).padStart(2, "0")}</span>
                        {line}
                      </code>
                    )}
                  </For>
                </pre>
              </div>
            )}
          </Match>
          <Match when={props.fixture.kind === "extensions" && props.fixture}>
            {(fixture) => (
              <div class="p-4">
                <div class="grid gap-3 sm:grid-cols-2">
                  <For each={fixture().widgets}>
                    {(widget) => (
                      <article class="rounded-lg border border-accent-border bg-accent-soft p-3">
                        <div class="mb-2 flex justify-between font-mono text-[9px] text-faint uppercase">
                          <strong>{widget.label}</strong>
                          <span>{widget.placement}</span>
                        </div>
                        <For each={widget.lines}>{(line) => <p class="m-0 text-xs leading-5">{line}</p>}</For>
                      </article>
                    )}
                  </For>
                </div>
                <div class="mt-4 overflow-hidden rounded-md border border-line-strong bg-[var(--code-background)] text-foreground">
                  <For each={fixture().statuses}>
                    {(status) => (
                      <div class="flex items-center gap-2 border-line-strong border-b px-3 py-2 font-mono text-[10px] last:border-b-0">
                        <span
                          class="size-1.5 rounded-full"
                          classList={{
                            "bg-success-solid": status.state === "ready",
                            "bg-warning": status.state === "warning",
                            "bg-disabled": status.state === "idle",
                          }}
                        />
                        <span>{status.label}</span>
                        <span class="ml-auto text-faint">{status.value}</span>
                      </div>
                    )}
                  </For>
                </div>
              </div>
            )}
          </Match>
          <Match when={props.fixture.kind === "written-files" && props.fixture}>
            {(fixture) => (
              <div class="p-4">
                <div class="divide-y divide-line-subtle rounded-lg border border-line">
                  <For each={fixture().files}>
                    {(file) => (
                      <div class="flex items-center gap-3 px-3 py-3 text-xs">
                        <span class="rounded bg-success/10 px-1.5 py-0.5 font-mono text-[9px] text-success">
                          {file.status}
                        </span>
                        <code class="min-w-0 flex-1 truncate">{file.path}</code>
                        <span class="font-mono text-[10px] text-success">+{file.additions}</span>
                        <span class="font-mono text-[10px] text-danger">−{file.deletions}</span>
                      </div>
                    )}
                  </For>
                </div>
                <p class="mb-0 text-right font-mono text-[10px] text-faint">{fixture().totals}</p>
              </div>
            )}
          </Match>
        </Switch>
      </div>
    </section>
  )
}
