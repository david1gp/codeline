import { For, Match, Switch } from "solid-js"
import type { DemoSurfaceFixture } from "./demoSurfaceFixture.js"

export function DemoSurfacePanel(props: { fixture: DemoSurfaceFixture }) {
  return (
    <section class="min-h-0 flex-1 overflow-auto bg-[#f7f8fa] p-4" aria-label={props.fixture.title} tabindex="0">
      <div class="mx-auto max-w-3xl overflow-hidden rounded-xl border border-[#d8dce3] bg-white shadow-[0_16px_45px_rgb(28_39_57_/_10%)]">
        <header class="border-[#d8dce3] border-b px-5 py-4">
          <div class="flex items-start justify-between gap-3">
            <div>
              <p class="m-0 font-mono text-[9px] tracking-[0.12em] text-[#2e68c7] uppercase">Configuration fixture</p>
              <h2 class="mt-1 mb-0 text-lg tracking-[-0.025em]">{props.fixture.title}</h2>
            </div>
            <span class="rounded-full bg-[#eef1f5] px-2 py-1 font-mono text-[9px] text-[#5f6879]">local only</span>
          </div>
          <p class="mt-2 mb-0 text-xs leading-5 text-[#5f6879]">{props.fixture.subtitle}</p>
        </header>

        <Switch>
          <Match when={props.fixture.kind === "models" && props.fixture}>
            {(fixture) => (
              <div class="divide-y divide-[#e5e8ed]">
                <For each={fixture().models}>
                  {(model) => (
                    <article class="grid grid-cols-[auto_1fr_auto] items-center gap-3 px-5 py-4">
                      <span
                        class="size-2 rounded-full"
                        classList={{ "bg-[#248451]": model.enabled, "bg-[#c3c9d2]": !model.enabled }}
                      />
                      <div class="min-w-0">
                        <strong class="block truncate text-sm">{model.label}</strong>
                        <span class="font-mono text-[10px] text-[#5f6879]">{model.provider}</span>
                      </div>
                      <div class="text-right font-mono text-[10px] text-[#5f6879]">
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
                    <article class="rounded-lg border border-[#d8dce3] p-3">
                      <div class="flex items-center gap-2">
                        <strong class="font-mono text-xs">/{skill.label}</strong>
                        <span class="ml-auto rounded bg-[#eef1f5] px-1.5 py-0.5 font-mono text-[9px]">
                          {skill.scope}
                        </span>
                      </div>
                      <p class="mb-3 text-xs leading-5 text-[#5f6879]">{skill.description}</p>
                      <span
                        class="font-mono text-[9px]"
                        classList={{
                          "text-[#1f7047]": skill.status === "available",
                          "text-[#5f6879]": skill.status === "disabled",
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
                      <div class="rounded-lg bg-[#f3f5f7] p-3">
                        <span class="block font-mono text-[9px] text-[#5f6879] uppercase">{metric.label}</span>
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
                          <span class="text-[#5f6879]">{usage.value}</span>
                        </div>
                        <div class="h-2 overflow-hidden rounded-full bg-[#e5e8ed]">
                          <span class="block h-full rounded-full bg-[#2e68c7]" style={{ width: `${usage.percent}%` }} />
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
                      <span class="rounded-md border border-[#d8dce3] px-2 py-1 font-mono text-[9px]">
                        <strong>{source.label}</strong> · {source.status}
                      </span>
                    )}
                  </For>
                </div>
                <pre
                  tabindex="0"
                  class="m-0 overflow-x-auto rounded-lg bg-[#202734] p-4 font-mono text-[11px] leading-6 text-[#d8dee9]"
                >
                  <For each={fixture().lines}>
                    {(line, index) => (
                      <code class="block">
                        <span class="mr-3 text-[#9da8b8]">{String(index() + 1).padStart(2, "0")}</span>
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
                      <article class="rounded-lg border border-[#b9c8e2] bg-[#f4f7fc] p-3">
                        <div class="mb-2 flex justify-between font-mono text-[9px] text-[#5f6879] uppercase">
                          <strong>{widget.label}</strong>
                          <span>{widget.placement}</span>
                        </div>
                        <For each={widget.lines}>{(line) => <p class="m-0 text-xs leading-5">{line}</p>}</For>
                      </article>
                    )}
                  </For>
                </div>
                <div class="mt-4 overflow-hidden rounded-md border border-[#394252] bg-[#202734] text-[#d8dee9]">
                  <For each={fixture().statuses}>
                    {(status) => (
                      <div class="flex items-center gap-2 border-[#394252] border-b px-3 py-2 font-mono text-[10px] last:border-b-0">
                        <span
                          class="size-1.5 rounded-full"
                          classList={{
                            "bg-[#248451]": status.state === "ready",
                            "bg-[#e2a23a]": status.state === "warning",
                            "bg-[#8b94a3]": status.state === "idle",
                          }}
                        />
                        <span>{status.label}</span>
                        <span class="ml-auto text-[#9da8b8]">{status.value}</span>
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
                <div class="divide-y divide-[#e5e8ed] rounded-lg border border-[#d8dce3]">
                  <For each={fixture().files}>
                    {(file) => (
                      <div class="flex items-center gap-3 px-3 py-3 text-xs">
                        <span class="rounded bg-[#edf8f1] px-1.5 py-0.5 font-mono text-[9px] text-[#1f7047]">
                          {file.status}
                        </span>
                        <code class="min-w-0 flex-1 truncate">{file.path}</code>
                        <span class="font-mono text-[10px] text-[#1f7047]">+{file.additions}</span>
                        <span class="font-mono text-[10px] text-[#ad3838]">−{file.deletions}</span>
                      </div>
                    )}
                  </For>
                </div>
                <p class="mb-0 text-right font-mono text-[10px] text-[#5f6879]">{fixture().totals}</p>
              </div>
            )}
          </Match>
        </Switch>
      </div>
    </section>
  )
}
