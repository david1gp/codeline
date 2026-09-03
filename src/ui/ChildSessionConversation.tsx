import { For, Show } from "solid-js"
import { Button } from "#ui/interactive/button/Button.jsx"
import { CodeBlock } from "#ui/static/code/CodeBlock.jsx"
import { FinalizedMessage } from "../message/ui/FinalizedMessage.js"
import type { SessionChildConversationLink } from "./sessionChildConversationLink.js"
import { childSessionConversationStateCreate } from "./childSessionConversationStateCreate.js"
import { SessionSemanticStepRow } from "./SessionSemanticStepRow.js"

export function ChildSessionConversation(props: { link: SessionChildConversationLink }) {
  const state = childSessionConversationStateCreate(() => props.link)

  return (
    <section aria-label="Child conversation" class="grid gap-3">
      <Show
        when={props.link.childSessionId}
        keyed
        fallback={
          <>
            <Show when={state.childDetail.isLoading() && state.childDetail.data() === undefined}>
              <p class="m-0 text-[13px] text-faint" role="status">
                Loading child conversation...
              </p>
            </Show>
            <Show when={state.childDetail.isError() && state.childDetail.data() === undefined}>
              <div class="flex items-center gap-2 text-[12px] text-danger" role="alert">
                <span>Child conversation could not be loaded.</span>
                <Button class="!h-8 !px-3 !text-xs" variant="outline" onClick={state.childDetail.retry}>
                  Retry
                </Button>
              </div>
            </Show>
            <Show when={state.childDetail.data()} keyed>
              {(detail) => (
                <div data-child-run-id={props.link.childRunId}>
                  <Show when={detail.kind === "finalized" ? detail.detail.transcript.assistantText : undefined} keyed>
                    {(answer) => (
                      <div>
                        <p class="m-0 mb-2 text-[11px] font-semibold tracking-[0.14em] text-faint uppercase">
                          Latest answer
                        </p>
                        <div class="rounded-xl border border-accent-border bg-accent-soft p-3">
                          <FinalizedMessage content={answer} role="assistant" state={state.copyState} />
                        </div>
                      </div>
                    )}
                  </Show>
                  <CodeBlock class="m-0 max-h-96 overflow-auto text-[11px]" data={detail} />
                </div>
              )}
            </Show>
          </>
        }
      >
        {(sessionId) => (
          <>
            <Show when={state.history.isLoading() && state.history.snapshot() === undefined}>
              <p class="m-0 text-[13px] text-faint" role="status">
                Loading child conversation...
              </p>
            </Show>
            <Show when={state.history.isError() && state.history.snapshot() === undefined}>
              <div class="flex items-center gap-2 text-[12px] text-danger" role="alert">
                <span>Child conversation could not be loaded.</span>
                <Button class="!h-8 !px-3 !text-xs" variant="outline" onClick={state.history.retry}>
                  Retry
                </Button>
              </div>
            </Show>
            <Show when={state.history.latestAnswer()} keyed>
              {(answer) => (
                <div>
                  <p class="m-0 mb-2 text-[11px] font-semibold tracking-[0.14em] text-faint uppercase">Latest answer</p>
                  <div class="rounded-xl border border-accent-border bg-accent-soft p-3">
                    <FinalizedMessage content={answer.content} role="assistant" state={state.copyState} />
                  </div>
                </div>
              )}
            </Show>
            <Show when={state.history.state()?.input} keyed>
              {(input) => (
                <div class="rounded-lg border border-warning-border bg-warning-soft px-3 py-2" role="status">
                  <p class="m-0 text-[11px] font-semibold uppercase">Waiting for input</p>
                  <p class="mt-1 mb-0 whitespace-pre-wrap break-words text-[12px]">{input.prompt}</p>
                </div>
              )}
            </Show>
            <Show when={state.history.hasMore() || state.history.isOlderLoading() || state.history.isOlderError()}>
              <Show
                when={state.history.isOlderError()}
                fallback={
                  <div class="flex items-center gap-2">
                    <Button
                      class="!h-8 !px-3 !text-xs"
                      disabled={state.history.isOlderLoading()}
                      aria-busy={state.history.isOlderLoading()}
                      variant="outline"
                      onClick={() => void state.history.loadOlder()}
                    >
                      Load older activity
                    </Button>
                    <Show when={state.history.isOlderLoading()}>
                      <span class="text-[12px] text-faint" role="status">
                        Loading older activity...
                      </span>
                    </Show>
                  </div>
                }
              >
                <div class="flex items-center gap-2 text-[12px] text-danger" role="alert">
                  <span>Older child activity could not be loaded.</span>
                  <Button class="!h-8 !px-3 !text-xs" variant="outline" onClick={state.history.retryOlder}>
                    Retry
                  </Button>
                </div>
              </Show>
            </Show>
            <ol class="m-0 grid list-none gap-1 p-0" aria-label="Child conversation activity">
              <For each={state.history.semanticSteps()}>
                {(step) => <SessionSemanticStepRow sessionId={sessionId} step={step} />}
              </For>
            </ol>
          </>
        )}
      </Show>
    </section>
  )
}
