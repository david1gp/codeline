import { For, Show } from "solid-js"
import { Button } from "#ui/interactive/button/Button.jsx"
import { FinalizedMessage } from "../message/ui/FinalizedMessage.js"
import type { SelectedSessionView } from "./selectedSessionView.js"
import { sessionSemanticHistoryStateCreate } from "./sessionSemanticHistoryStateCreate.js"
import { SessionSemanticStepRow } from "./SessionSemanticStepRow.js"

export function SessionSemanticHistory(props: { state: SelectedSessionView }) {
  const state = sessionSemanticHistoryStateCreate(props.state.latestAnswer)

  return (
    <div class="grid gap-4">
      <Show when={props.state.latestAnswer()} keyed>
        {(answer) => (
          <section
            class="overflow-hidden rounded-2xl border border-line bg-surface-raised shadow-[0_1px_2px_var(--shadow-color),0_14px_38px_-28px_var(--shadow-color-strong)]"
            aria-labelledby="latest-agent-answer-heading"
          >
            <div class="flex items-center gap-2 border-line-subtle border-b px-4 py-2.5">
              <span class="size-2 rounded-full bg-accent" aria-hidden="true" />
              <p
                id="latest-agent-answer-heading"
                class="m-0 text-[11px] font-semibold tracking-[0.12em] text-faint uppercase"
              >
                Response
              </p>
            </div>
            <div class="px-4 py-4 max-[760px]:px-3.5">
              <FinalizedMessage content={answer.content} role="assistant" state={state.copyState} />
            </div>
          </section>
        )}
      </Show>

      <Show when={props.state.compactState()?.input} keyed>
        {(input) => (
          <section
            class="rounded-xl border border-warning-border bg-warning-soft px-4 py-3 shadow-[0_1px_2px_var(--shadow-color)]"
            aria-label="Waiting for input"
            role="status"
          >
            <p class="m-0 text-[11px] font-semibold tracking-[0.12em] uppercase">Waiting for input</p>
            <p class="mt-1 mb-0 whitespace-pre-wrap break-words text-[13px]">{input.prompt}</p>
          </section>
        )}
      </Show>

      <section
        class="rounded-2xl border border-line bg-surface-raised p-4 shadow-[0_1px_2px_var(--shadow-color)] max-[760px]:p-3"
        aria-labelledby="recent-session-steps-heading"
      >
        <div class="mb-3 flex items-center justify-between gap-2 border-line-subtle border-b pb-3">
          <p
            id="recent-session-steps-heading"
            class="m-0 text-[11px] font-semibold tracking-[0.14em] text-faint uppercase"
          >
            Activity
          </p>
          <span class="rounded-full bg-surface-sunken px-2 py-1 text-[10px] font-medium text-faint">
            {props.state.semanticSteps().length} steps
          </span>
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
          <ol class="m-0 grid list-none gap-1.5 p-0" aria-label="Recent semantic activity">
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
