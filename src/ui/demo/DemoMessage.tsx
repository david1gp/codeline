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
        class="mb-2 flex items-center gap-2 font-mono text-[10px] font-semibold tracking-[0.08em] text-[#5f6879] uppercase"
        classList={{ "justify-end": props.message.author === "user" }}
      >
        <span class="size-1.5 rounded-full bg-[#2e68c7]" />
        {props.message.label ?? props.message.author}
        <Show when={props.message.streaming}>
          <span class="animate-pulse text-[#2e68c7]">streaming</span>
        </Show>
      </div>

      <Switch>
        <Match when={props.message.kind === "thinking"}>
          <div class="rounded-lg border border-[#d8dce3] bg-[#fafbfc] p-3 text-sm italic leading-6 text-[#5f6879]">
            {props.message.body}
          </div>
        </Match>
        <Match when={props.message.kind === "tool"}>
          <div
            class="overflow-hidden rounded-lg border bg-[#fbfcfd]"
            classList={{
              "border-[#e2b5b5]": props.message.resultTone === "error",
              "border-[#b9d8c6]": props.message.resultTone !== "error",
            }}
          >
            <pre
              tabindex="0"
              class="m-0 overflow-x-auto border-[#d8dce3] border-b px-3 py-2 font-mono text-[11px] leading-5 text-[#4d596b]"
            >
              <code>{props.message.body}</code>
            </pre>
            <pre
              tabindex="0"
              class="m-0 overflow-x-auto px-3 py-2 font-mono text-[11px] leading-5"
              classList={{
                "bg-[#fff6f6] text-[#a33d3d]": props.message.resultTone === "error",
                "bg-[#f4fbf6] text-[#276b45]": props.message.resultTone !== "error",
              }}
            >
              <code>{props.message.result}</code>
            </pre>
          </div>
        </Match>
        <Match when={props.message.kind === "code"}>
          <div class="overflow-hidden rounded-lg bg-[#202734] text-[#d8dee9]">
            <div class="border-[#394252] border-b px-3 py-1.5 font-mono text-[10px] text-[#9da8b8]">
              {props.message.label}
            </div>
            <pre tabindex="0" class="m-0 overflow-x-auto p-3 font-mono text-[11px] leading-5">
              <code>{props.message.body}</code>
            </pre>
          </div>
        </Match>
        <Match when={props.message.kind === "attachment"}>
          <div class="overflow-hidden rounded-xl border border-[#b9c8e2] bg-[#eef3fc] p-2">
            <div class="grid aspect-[16/7] place-items-center rounded-lg bg-[linear-gradient(135deg,#d9e5f7,#f4e7d8)]">
              <div class="rounded-lg border border-white/70 bg-white/75 px-5 py-4 text-center shadow-sm backdrop-blur">
                <span class="block font-mono text-2xl text-[#2e68c7]">▧</span>
                <strong class="mt-1 block text-xs">{props.message.body}</strong>
              </div>
            </div>
          </div>
        </Match>
        <Match when={props.message.kind === "error"}>
          <div
            role="alert"
            class="rounded-lg border border-[#e2b5b5] bg-[#fff6f6] px-3 py-2 text-sm leading-6 text-[#a33d3d]"
          >
            {props.message.body}
          </div>
        </Match>
        <Match when={true}>
          <div
            class="whitespace-pre-wrap text-sm leading-6"
            classList={{ "rounded-xl bg-[#eef3fc] px-4 py-3": props.message.author === "user" }}
          >
            {props.message.body}
            <Show when={props.message.streaming}>
              <span class="ml-1 inline-block h-4 w-1 animate-pulse bg-[#2e68c7] align-middle" aria-hidden="true" />
            </Show>
          </div>
        </Match>
      </Switch>

      <div
        class="mt-2 flex flex-wrap items-center gap-1.5 font-mono text-[10px] text-[#5f6879]"
        classList={{ "justify-end": props.message.author === "user" }}
      >
        <Show when={props.message.detail}>
          <span>{props.message.detail}</span>
        </Show>
        <For each={props.message.actions}>
          {(action) => <span class="rounded px-1.5 py-0.5 text-[#5f6879] group-hover:bg-[#eef1f5]">{action}</span>}
        </For>
      </div>
    </article>
  )
}
