import { Show } from "solid-js"
import { Button } from "#ui/interactive/button/Button.jsx"
import { Details } from "#ui/interactive/details/Details.jsx"
import { Badge } from "#ui/static/badge/Badge.jsx"
import { CodeBlock } from "#ui/static/code/CodeBlock.jsx"
import type { SessionSemanticStep } from "../session/api/sessionSemanticStepSchema.js"
import type { SessionChildConversationLink } from "./sessionChildConversationLink.js"
import { sessionSemanticStepRowStateCreate } from "./sessionSemanticStepRowStateCreate.js"

export function SessionSemanticStepRow(props: {
  onChildConversation?: (link: SessionChildConversationLink) => void
  sessionId: string
  step: SessionSemanticStep
}) {
  const state = sessionSemanticStepRowStateCreate({
    onChildConversation: props.onChildConversation,
    sessionId: () => props.sessionId,
    step: () => props.step,
  })

  return (
    <li
      class="min-w-0"
      data-session-message-role={props.step.kind === "message" ? props.step.role : undefined}
      data-session-semantic-kind={props.step.kind}
    >
      <Show
        when={props.step.kind === "run" || props.step.kind === "tool"}
        fallback={
          <div class="flex min-w-0 items-start gap-2 rounded-lg px-2 py-1.5 text-[12px]">
            <Badge class="mt-0.5 shrink-0 border-line-subtle px-1.5 py-0 text-[10px]" variant="outline">
              {props.step.kind === "message" ? props.step.role : props.step.kind}
            </Badge>
            <span class="min-w-0 whitespace-pre-wrap break-words text-faint">{props.step.summary}</span>
          </div>
        }
      >
        <div data-session-history-entry-id={props.step.id} onClick={state.detailExpand}>
          <Details
            class="!border-line-subtle !bg-surface !shadow-none"
            summaryClass="!min-h-9 !flex-row !gap-2 !p-2"
            summaryEl={
              <span class="flex min-w-0 flex-1 items-center gap-2 text-left">
                <Badge class="shrink-0 border-line-subtle px-1.5 py-0 text-[10px]" variant="subtle">
                  {props.step.kind}
                </Badge>
                <span class="min-w-0 truncate text-[12px] text-faint">{props.step.summary}</span>
              </span>
            }
          >
            <div class="border-line-subtle border-t px-3 py-2">
              <Show when={state.isDetailLoading()}>
                <p class="m-0 text-[12px] text-faint" role="status">
                  Loading full details...
                </p>
              </Show>
              <Show when={state.isDetailError()}>
                <div class="flex items-center gap-2 text-[12px] text-danger" role="alert">
                  <span>Full details could not be loaded.</span>
                  <Button class="!h-7 !px-2 !text-xs" variant="outline" onClick={state.detailRetry}>
                    Retry
                  </Button>
                </div>
              </Show>
              <Show when={state.detail()} keyed>
                {(detail) => <CodeBlock class="m-0 max-h-96 overflow-auto text-[11px]" data={detail} />}
              </Show>
            </div>
          </Details>
        </div>
        <Show when={props.step.kind === "tool" && props.step.childReference != null}>
          <Button
            class="!mt-1 !h-8 !w-full !justify-start !px-2 !text-xs"
            data-child-run-id={props.step.kind === "tool" ? props.step.childReference?.childRunId : undefined}
            data-child-session-id={props.step.kind === "tool" ? props.step.childReference?.childSessionId : undefined}
            variant="outline"
            onClick={state.childConversationOpen}
          >
            Open child conversation
          </Button>
        </Show>
      </Show>
    </li>
  )
}
