import { For, Show } from "solid-js"
import { Badge } from "#ui/static/badge/Badge.jsx"
import type { BadgeVariant } from "#ui/static/badge/badgeCva.jsx"
import type { SessionChildConversationLink } from "./sessionChildConversationLink.js"
import type { SessionStreamEntry } from "./sessionStreamGroupsDerive.js"

const badgeCompactClass = "shrink-0 border-line-subtle px-1.5 py-0 text-[10px]"

const streamEntryVariant: Record<SessionStreamEntry["kind"], BadgeVariant> = {
  output: "contrast",
  terminal: "outline",
  thinking: "subtle",
  tool: "subtle",
  "written-file": "outline",
}

export function SessionStreamEntryList(props: {
  entries: ReadonlyArray<SessionStreamEntry>
  onDelegation?: (delegation: SessionChildConversationLink) => void
}) {
  return (
    <ol class="m-0 grid list-none gap-1 p-0">
      <For each={props.entries}>
        {(entry) => (
          <Show
            when={entry.delegation?.childSessionId && entry.delegation.parentSessionId ? entry.delegation : undefined}
            fallback={<SessionStreamEntryRow entry={entry} />}
          >
            {(delegation) => (
              <li class="min-w-0">
                <button
                  class="flex w-full min-w-0 cursor-pointer flex-wrap items-baseline gap-1.5 rounded-lg border border-accent-border bg-accent-soft px-2 py-1 text-left text-[11px] text-faint hover:bg-surface-hover"
                  type="button"
                  aria-label={`Open subagent thread: ${entry.label}. Task: ${delegation().task}`}
                  data-child-agent-id={delegation().childAgentId}
                  data-child-session-id={delegation().childSessionId ?? undefined}
                  data-child-stream-id={delegation().childStreamId}
                  onClick={() =>
                    props.onDelegation?.({
                      childSessionId: delegation().childSessionId ?? "",
                      childStreamId: delegation().childStreamId,
                      delegationId: delegation().id,
                      parentSessionId: delegation().parentSessionId ?? "",
                      task: delegation().task,
                    })
                  }
                >
                  <Badge class={badgeCompactClass} variant="subtle">
                    subagent
                  </Badge>
                  <span class="text-accent">{entry.label}</span>
                  <Badge class={badgeCompactClass} variant="outline">
                    Open thread
                  </Badge>
                  <span class="basis-full whitespace-pre-wrap break-words text-placeholder">{delegation().task}</span>
                </button>
              </li>
            )}
          </Show>
        )}
      </For>
    </ol>
  )
}

function SessionStreamEntryRow(props: { entry: SessionStreamEntry }) {
  return (
    <li class="flex min-w-0 flex-wrap items-baseline gap-1.5 text-[11px] text-faint">
      <Badge class={badgeCompactClass} variant={streamEntryVariant[props.entry.kind]}>
        {props.entry.kind}
      </Badge>
      <span class="text-accent">{props.entry.label}</span>
      <Show when={props.entry.status}>{(status) => <span>· {status()}</span>}</Show>
      <Show when={props.entry.detail}>
        {(detail) => (
          <span class="min-w-0 basis-full whitespace-pre-wrap break-words text-placeholder">{detail()}</span>
        )}
      </Show>
    </li>
  )
}
