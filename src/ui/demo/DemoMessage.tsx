import { For, Match, Show, Switch } from "solid-js"
import type { DemoScenarioFixture } from "./demoScenarioFixture.js"

export function DemoMessage(props: { message: DemoScenarioFixture["messages"][number] }) {
  return (
    <article
      class="group mb-7"
      classList={{ "ml-auto max-w-[88%]": props.message.author === "user" }}
      data-message-kind={props.message.kind ?? "markdown"}
    >
      <div
        class="mb-2 flex items-center gap-2 font-mono text-[10px] font-semibold tracking-[0.08em] text-faint uppercase"
        classList={{ "justify-end": props.message.author === "user" }}
      >
        <span class="size-1.5 rounded-full bg-accent" />
        {props.message.label ?? props.message.author}
        <Show when={props.message.streaming}>
          <span class="animate-pulse text-accent">streaming</span>
        </Show>
      </div>

      <Switch>
        <Match when={props.message.kind === "thinking"}>
          <div class="rounded-lg border border-line bg-surface-sunken p-3 text-sm italic leading-6 text-faint">
            {props.message.body}
          </div>
        </Match>
        <Match when={props.message.kind === "tool"}>
          <div
            class="overflow-hidden rounded-lg border bg-surface"
            classList={{
              "border-danger-border": props.message.resultTone === "error",
              "border-success-border": props.message.resultTone !== "error",
            }}
          >
            <pre
              tabindex="0"
              class="m-0 overflow-x-auto border-line border-b px-3 py-2 font-mono text-[11px] leading-5 text-subtle"
            >
              <code>{props.message.body}</code>
            </pre>
            <pre
              tabindex="0"
              class="m-0 overflow-x-auto px-3 py-2 font-mono text-[11px] leading-5"
              classList={{
                "bg-danger-soft text-danger": props.message.resultTone === "error",
                "bg-success-soft text-success": props.message.resultTone !== "error",
              }}
            >
              <code>{props.message.result}</code>
            </pre>
          </div>
        </Match>
        <Match when={props.message.kind === "code"}>
          <div class="overflow-hidden rounded-lg bg-code-preview text-code-preview-foreground">
            <div class="border-code-preview-line border-b px-3 py-1.5 font-mono text-[10px] text-code-preview-muted">
              {props.message.label}
            </div>
            <pre tabindex="0" class="m-0 overflow-x-auto p-3 font-mono text-[11px] leading-5">
              <code>{props.message.body}</code>
            </pre>
          </div>
        </Match>
        <Match when={props.message.kind === "attachment"}>
          <div class="overflow-hidden rounded-xl border border-accent-border bg-accent-soft p-2">
            <div class="grid aspect-[16/7] place-items-center rounded-lg bg-[linear-gradient(135deg,var(--accent-soft),var(--danger-soft))]">
              <div class="rounded-lg border border-line bg-surface/75 px-5 py-4 text-center shadow-sm backdrop-blur">
                <span class="block font-mono text-2xl text-accent">▧</span>
                <strong class="mt-1 block text-xs">{props.message.body}</strong>
              </div>
            </div>
          </div>
        </Match>
        <Match when={props.message.kind === "error"}>
          <div
            role="alert"
            class="rounded-lg border border-danger-border bg-danger-soft px-3 py-2 text-sm leading-6 text-danger"
          >
            {props.message.body}
          </div>
        </Match>
        <Match when={true}>
          <div
            class="whitespace-pre-wrap text-sm leading-6"
            classList={{ "rounded-xl bg-accent-soft px-4 py-3": props.message.author === "user" }}
          >
            {props.message.body}
            <Show when={props.message.streaming}>
              <span class="ml-1 inline-block h-4 w-1 animate-pulse bg-accent align-middle" aria-hidden="true" />
            </Show>
          </div>
        </Match>
      </Switch>

      <div
        class="mt-2 flex flex-wrap items-center gap-1.5 font-mono text-[10px] text-faint"
        classList={{ "justify-end": props.message.author === "user" }}
      >
        <Show when={props.message.detail}>
          <span>{props.message.detail}</span>
        </Show>
        <For each={props.message.actions}>
          {(action) => <span class="rounded px-1.5 py-0.5 text-faint group-hover:bg-surface-hover">{action}</span>}
        </For>
      </div>
    </article>
  )
}
