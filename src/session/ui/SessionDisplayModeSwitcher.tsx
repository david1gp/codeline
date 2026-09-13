import { ButtonIconOnly } from "#ui/interactive/button/ButtonIconOnly.jsx"
import { applicationIcon } from "../../ui/applicationIcon.js"
import type { sessionDisplayModeStateCreate } from "./sessionDisplayModeStateCreate.js"

export function SessionDisplayModeSwitcher(props: { state: ReturnType<typeof sessionDisplayModeStateCreate> }) {
  return (
    <fieldset class="m-0 inline-flex shrink-0 gap-0.5 rounded-lg border border-line p-0.5">
      <legend class="sr-only">Session display mode</legend>
      <ButtonIconOnly
        class="size-7 text-faint hover:bg-surface-hover hover:text-accent aria-pressed:bg-line-subtle aria-pressed:text-accent"
        icon={applicationIcon.conversationView}
        iconClass="size-4"
        title="Conversation view"
        aria-label="Conversation view"
        aria-pressed={props.state.mode() === "conversation"}
        onClick={() => props.state.modeSelect("conversation")}
      />
      <ButtonIconOnly
        class="size-7 text-faint hover:bg-surface-hover hover:text-accent aria-pressed:bg-line-subtle aria-pressed:text-accent"
        icon={applicationIcon.streamView}
        iconClass="size-4"
        title="Stream view"
        aria-label="Stream view"
        aria-pressed={props.state.mode() === "stream"}
        onClick={() => props.state.modeSelect("stream")}
      />
    </fieldset>
  )
}
