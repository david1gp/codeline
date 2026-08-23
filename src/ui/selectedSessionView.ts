import type { finalizedMessageCopyStateCreate } from "../message/ui/finalizedMessageCopyStateCreate.js"
import type { SessionReadOnlyReason } from "../session/client/sessionReadOnlyReasonResolve.js"
import type { sessionRenameControlStateCreate } from "../session/ui/sessionRenameControlStateCreate.js"
import type { SessionChatState } from "./sessionChatStateCreate.js"
import type { sessionDisplayModeStateCreate } from "./sessionDisplayModeStateCreate.js"
import type { sessionPinToggleStateCreate } from "./sessionPinToggleStateCreate.js"
import type { SessionStreamGroup } from "./sessionStreamGroupsDerive.js"
import type { sessionSubagentThreadStateCreate } from "./sessionSubagentThreadStateCreate.js"

export type SelectedSessionViewMessage = {
  copyState: ReturnType<typeof finalizedMessageCopyStateCreate>
  content: string
  role: string
}

export type SelectedSessionViewSession = {
  id: string
  title: string
}

/**
 * Rendering contract of the selected session view, so production state and
 * demo fixtures can supply the same shape without the view knowing the source.
 */
export type SelectedSessionView = {
  chatCreate: (sessionId: string) => SessionChatState
  hasSelection: () => boolean
  initialChat: SessionChatState
  isInitialChatVisible: () => boolean
  isMessagesEmpty: () => boolean
  isMessagesError: () => boolean
  isMessagesLoading: () => boolean
  isMessagesRefreshing: () => boolean
  isSessionError: () => boolean
  isSessionLoading: () => boolean
  messages: () => ReadonlyArray<SelectedSessionViewMessage>
  /** Explains why the open session is read-only, or null when it is editable. */
  readOnlyReason: () => SessionReadOnlyReason | null
  /** Single-sentence notice matching `readOnlyReason`, or undefined when editable. */
  readOnlyNotice: () => string | undefined
  refresh: () => void
  revalidate: () => void
  displayMode: ReturnType<typeof sessionDisplayModeStateCreate>
  renameState: () => ReturnType<typeof sessionRenameControlStateCreate> | undefined
  pinState: () => ReturnType<typeof sessionPinToggleStateCreate> | undefined
  retryMessages: () => void
  retrySession: () => void
  streamGroups: () => ReadonlyArray<SessionStreamGroup>
  isStreamLoading: () => boolean
  session: () => SelectedSessionViewSession | undefined
  subagentThread: ReturnType<typeof sessionSubagentThreadStateCreate>
}
