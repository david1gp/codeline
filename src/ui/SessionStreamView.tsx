import { For, Show } from "solid-js"
import { Badge } from "#ui/static/badge/Badge.jsx"
import type { BadgeVariant } from "#ui/static/badge/badgeCva.jsx"
import { FinalizedMessage } from "../message/ui/FinalizedMessage.js"
import type { SessionStreamEntry } from "./sessionStreamGroupsDerive.js"
import type { SelectedSessionView } from "./selectedSessionView.js"

const badgeCompactClass = "shrink-0 border-line-subtle px-1.5 py-0 text-[10px]"

const streamEntryVariant: Record<SessionStreamEntry["kind"], BadgeVariant> = {
  output: "contrast",
  terminal: "outline",
  thinking: "subtle",
  tool: "subtle",
  "written-file": "outline",
}

/**
 * Alternative session presentation: every finalized message followed by the
 * persisted and in-flight execution stream. Messages and stream events stay
 * separate blocks because the schema carries no message-to-stream link.
 */
export function SessionStreamView(props: { state: SelectedSessionView }) {
  return (
    <div class="grid gap-5">
      <Show when={props.state.messages().length > 0}>
        <section aria-label="Finalized messages">
          <p class="m-0 mb-2 text-[11px] font-semibold tracking-[0.14em] text-faint uppercase">Messages</p>
          <ol class="m-0 grid list-none gap-4 p-0">
            <For each={props.state.messages()}>
              {(message) =>
                message.role === "assistant" || message.role === "user" ? (
                  <li class="min-w-0">
                    <FinalizedMessage content={message.content} role={message.role} state={message.copyState} />
                  </li>
                ) : null
              }
            </For>
          </ol>
        </section>
      </Show>

      <section aria-label="Execution stream">
        <p class="m-0 mb-2 text-[11px] font-semibold tracking-[0.14em] text-faint uppercase">Stream</p>
        <Show
          when={props.state.streamGroups().length > 0}
          fallback={
            <p class="m-0 text-[13px] text-faint" role="status">
              {props.state.isStreamLoading() ? "Loading stream events..." : "No stream events recorded yet."}
            </p>
          }
        >
          <ol class="m-0 grid list-none gap-3 p-0">
            <For each={props.state.streamGroups()}>
              {(group) => (
                <li class="min-w-0 rounded-xl border border-line-subtle bg-surface px-3 py-2">
                  <div class="flex flex-wrap items-center gap-2">
                    <span class="text-[12px] font-semibold">{group.label}</span>
                    <Show when={group.status}>
                      {(status) => (
                        <Badge class={badgeCompactClass} variant="outline">
                          {status()}
                        </Badge>
                      )}
                    </Show>
                    <span class="ml-auto truncate font-mono text-[10px] text-placeholder">{group.streamId}</span>
                  </div>
                  <ol class="m-0 mt-2 grid list-none gap-1 p-0">
                    <For each={group.entries}>
                      {(entry) => (
                        <li class="flex min-w-0 flex-wrap items-baseline gap-1.5 text-[11px] text-faint">
                          <Badge class={badgeCompactClass} variant={streamEntryVariant[entry.kind]}>
                            {entry.kind}
                          </Badge>
                          <span class="text-accent">{entry.label}</span>
                          <Show when={entry.status}>{(status) => <span>· {status()}</span>}</Show>
                          <Show when={entry.detail}>
                            {(detail) => (
                              <span class="min-w-0 basis-full whitespace-pre-wrap break-words text-placeholder">
                                {detail()}
                              </span>
                            )}
                          </Show>
                        </li>
                      )}
                    </For>
                  </ol>
                </li>
              )}
            </For>
          </ol>
        </Show>
      </section>
    </div>
  )
}
