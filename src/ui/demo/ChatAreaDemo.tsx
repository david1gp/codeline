import { For, Show } from "solid-js"
import { Textarea } from "#ui/input/textarea/Textarea.jsx"
import { Button } from "#ui/interactive/button/Button.jsx"
import type { demoChatAreaStateCreate } from "./demoChatAreaStateCreate.js"

export function ChatAreaDemo(props: { state: ReturnType<typeof demoChatAreaStateCreate> }) {
  return (
    <section
      class="flex h-[calc(100dvh-48px)] min-h-[560px] flex-col overflow-hidden bg-[radial-gradient(circle_at_50%_-20%,var(--accent-soft),transparent_46%)] max-[760px]:h-[calc(100dvh-92px)]"
      aria-label="Chat area demo"
    >
      <header class="flex h-14 shrink-0 items-center gap-3 border-line border-b bg-surface/85 px-5 backdrop-blur-xl max-[640px]:px-4">
        <span class="grid size-8 place-items-center rounded-lg border border-accent-border bg-accent-soft font-mono text-[10px] font-semibold text-accent">
          CL
        </span>
        <div class="min-w-0">
          <h2 class="m-0 truncate text-sm font-semibold">Polish the active session</h2>
          <p class="m-0 truncate text-[11px] text-faint">codeline · main · demo fixture</p>
        </div>
        <span class="ml-auto flex items-center gap-1.5 rounded-full border border-line bg-surface-raised px-2.5 py-1 font-mono text-[9px] tracking-[0.06em] text-faint uppercase">
          <span class="size-1.5 rounded-full bg-emerald-500" /> Ready
        </span>
      </header>

      <div
        ref={props.state.conversationElementSet}
        class="min-h-0 flex-1 overflow-y-auto overscroll-contain scroll-smooth"
        role="region"
        tabIndex={0}
        aria-label="Sample conversation"
        onScroll={(event) => props.state.conversationScroll(event.currentTarget.scrollTop)}
      >
        <ol class="mx-auto grid w-full max-w-[780px] list-none gap-7 px-5 pt-9 pb-12 max-[640px]:gap-6 max-[640px]:px-4">
          <For each={props.state.messages}>
            {(message) => (
              <li class="grid gap-1.5" classList={{ "justify-items-end": message.role === "user" }}>
                <span class="px-1 font-mono text-[9px] tracking-[0.06em] text-faint uppercase">
                  {message.role === "user" ? "You" : message.role === "assistant" ? "Codeline" : message.detail}
                </span>
                <Show
                  when={message.role === "activity"}
                  fallback={
                    <div
                      class="text-[13px] leading-6 text-foreground"
                      classList={{
                        "max-w-[82%] rounded-2xl rounded-br-md border border-accent-border bg-accent-soft px-4 py-2.5 shadow-[0_8px_22px_var(--shadow-color)]":
                          message.role === "user",
                        "w-full": message.role === "assistant",
                      }}
                    >
                      {message.text}
                    </div>
                  }
                >
                  <div class="flex w-full items-start gap-3 rounded-xl border border-line-subtle bg-surface/70 px-3.5 py-3 text-xs leading-5 text-faint shadow-[0_6px_18px_var(--shadow-color)]">
                    <span class="mt-1 grid size-5 shrink-0 place-items-center rounded-md bg-muted font-mono text-[9px] text-accent">
                      ✓
                    </span>
                    <span>{message.text}</span>
                  </div>
                </Show>
                <Show when={message.role !== "activity"}>
                  <span class="px-1 font-mono text-[9px] text-placeholder">{message.detail}</span>
                </Show>
              </li>
            )}
          </For>
        </ol>
      </div>

      <div class="pointer-events-none relative z-10 shrink-0 px-4 pb-5 max-[640px]:px-3 max-[640px]:pb-3">
        <div class="pointer-events-auto mx-auto w-full max-w-[780px]">
          <form
            class="overflow-hidden rounded-[20px] border border-line bg-surface-raised shadow-[0_2px_4px_var(--shadow-color),0_20px_55px_-22px_var(--shadow-color-strong)] transition-[border-color,box-shadow] duration-300 ease-out focus-within:border-accent-border focus-within:shadow-[0_2px_4px_var(--shadow-color),0_22px_60px_-20px_var(--shadow-color-strong)] motion-reduce:transition-none"
            classList={{ "border-line-subtle": props.state.collapsed() }}
            aria-label="Demo chat composer"
            aria-expanded={!props.state.collapsed()}
            onClick={props.state.composerExpand}
            onFocusIn={props.state.composerExpand}
            onSubmit={props.state.submitHandle}
          >
            <div
              class="grid transition-[grid-template-rows,padding] duration-300 ease-out motion-reduce:transition-none"
              classList={{
                "grid-rows-[minmax(52px,1fr)] px-3 py-1": props.state.collapsed(),
                "grid-rows-[minmax(96px,1fr)] px-4 pt-3": !props.state.collapsed(),
              }}
            >
              <Textarea
                class="!min-h-0 !resize-none !rounded-none !border-0 !bg-transparent !p-0 text-sm leading-6 text-foreground shadow-none outline-none placeholder:text-placeholder focus-visible:ring-0 focus-visible:ring-offset-0"
                aria-label="Message"
                placeholder="Ask Codeline to change something…"
                ref={props.state.composerElementSet}
                rows={props.state.collapsed() ? 1 : 3}
                value={props.state.draft()}
                onFocus={props.state.composerExpand}
                onInput={(event) => props.state.draftUpdate(event.currentTarget.value)}
                onKeyDown={props.state.keyDownHandle}
                onPointerDown={props.state.composerExpand}
              />
            </div>

            <div
              class="flex items-center gap-2 px-3 transition-[height,opacity,padding] duration-300 ease-out motion-reduce:transition-none"
              classList={{
                "h-0 overflow-hidden pb-0 opacity-0": props.state.collapsed(),
                "h-12 pb-2 opacity-100": !props.state.collapsed(),
              }}
              aria-hidden={props.state.collapsed()}
            >
              <Button
                variant="ghost"
                size="none"
                class="h-8 rounded-lg px-2.5 text-[11px] text-faint"
                tabIndex={props.state.collapsed() ? -1 : 0}
              >
                ＋ Context
              </Button>
              <Button
                variant="ghost"
                size="none"
                class="h-8 rounded-lg px-2.5 text-[11px] text-faint"
                tabIndex={props.state.collapsed() ? -1 : 0}
              >
                Auto
              </Button>
              <span class="ml-auto hidden text-[10px] text-faint sm:inline">
                Enter to send · Shift+Enter for newline
              </span>
              <Button
                type="submit"
                variant="none"
                size="none"
                class="grid size-8 place-items-center rounded-full bg-accent p-0 text-accent-contrast hover:brightness-110 disabled:opacity-40"
                aria-label="Send message"
                disabled={props.state.draft().trim() === ""}
                tabIndex={props.state.collapsed() ? -1 : 0}
              >
                <span aria-hidden="true" class="text-base leading-none">
                  ↑
                </span>
              </Button>
            </div>
          </form>
          <div class="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-2 text-[10px] text-faint">
            <span aria-live="polite">{props.state.status()}</span>
            <span class="font-mono tracking-[0.04em]">Scroll up to collapse</span>
          </div>
        </div>
      </div>
    </section>
  )
}
