import { For, Show } from "solid-js"
import { Button } from "#ui/interactive/button/Button.jsx"
import { FinalizedMessage } from "../message/ui/FinalizedMessage.js"
import type { SelectedSessionView } from "./selectedSessionView.js"
import { sessionSemanticHistoryStateCreate } from "./sessionSemanticHistoryStateCreate.js"
import { SessionSemanticStepRow } from "./SessionSemanticStepRow.js"

export function SessionSemanticHistory(props: { state: SelectedSessionView }) {
  const state = sessionSemanticHistoryStateCreate(props.state.latestAnswer)

  return (
    <div class="grid gap-5">
      <Show when={props.state.latestAnswer()} keyed>
        {(answer) => (
          <section aria-labelledby="latest-agent-answer-heading">
            <p
              id="latest-agent-answer-heading"
              class="m-0 mb-2 text-[11px] font-semibold tracking-[0.14em] text-faint uppercase"
            >
              Latest agent answer
            </p>
            <div class="rounded-xl border border-accent-border bg-accent-soft p-3 shadow-sm">
              <FinalizedMessage content={answer.content} role="assistant" state={state.copyState} />
            </div>
          </section>
        )}
      </Show>

      <Show when={props.state.compactState()?.input} keyed>
        {(input) => (
          <section
            class="rounded-xl border border-warning-border bg-warning-soft px-3 py-2"
            aria-label="Waiting for input"
            role="status"
          >
            <p class="m-0 text-[11px] font-semibold tracking-[0.12em] uppercase">Waiting for input</p>
            <p class="mt-1 mb-0 whitespace-pre-wrap break-words text-[13px]">{input.prompt}</p>
          </section>
        )}
      </Show>

      <section aria-labelledby="recent-session-steps-heading">
        <div class="mb-2 flex items-center justify-between gap-2">
          <p
            id="recent-session-steps-heading"
            class="m-0 text-[11px] font-semibold tracking-[0.14em] text-faint uppercase"
          >
            Recent activity
          </p>
          <span class="text-[10px] text-placeholder">{props.state.semanticSteps().length} semantic steps</span>
        </div>

        <Show
          when={
            props.state.hasOlderHistory() || props.state.isOlderHistoryLoading() || props.state.isOlderHistoryError()
          }
        >
          <div class="mb-2 flex min-h-8 items-center justify-center gap-2">
            <Show
              when={props.state.isOlderHistoryError()}
              fallback={
                <>
                  <Button
                    class="!h-8 !px-3 !text-xs"
                    disabled={props.state.isOlderHistoryLoading()}
                    aria-busy={props.state.isOlderHistoryLoading()}
                    variant="outline"
                    onClick={props.state.loadOlderHistory}
                  >
                    Load older activity
                  </Button>
                  <Show when={props.state.isOlderHistoryLoading()}>
                    <span class="text-[12px] text-faint" role="status">
                      Loading older activity...
                    </span>
                  </Show>
                </>
              }
            >
              <div class="flex items-center gap-2 text-[12px] text-danger" role="alert">
                <span>Older activity could not be loaded.</span>
                <Button class="!h-8 !px-3 !text-xs" variant="outline" onClick={props.state.retryOlderHistory}>
                  Retry
                </Button>
              </div>
            </Show>
          </div>
        </Show>

        <Show
          when={props.state.semanticSteps().length > 0}
          fallback={
            <p class="m-0 py-5 text-center text-[13px] text-faint" role="status">
              No recent activity yet.
            </p>
          }
        >
          <ol class="m-0 grid list-none gap-1 p-0" aria-label="Recent semantic activity">
            <For each={props.state.semanticSteps()}>
              {(step) => (
                <SessionSemanticStepRow
                  onChildConversation={props.state.subagentThread.open}
                  sessionId={props.state.session()?.id ?? ""}
                  step={step}
                />
              )}
            </For>
          </ol>
        </Show>
      </section>
    </div>
  )
}
