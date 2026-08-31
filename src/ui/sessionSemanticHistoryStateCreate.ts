import { finalizedMessageCopyStateCreate } from "../message/ui/finalizedMessageCopyStateCreate.js"
import type { SessionLatestAnswer } from "../session/api/sessionLatestAnswerSchema.js"

export function sessionSemanticHistoryStateCreate(latestAnswer: () => SessionLatestAnswer) {
  const copyState = finalizedMessageCopyStateCreate({ content: () => latestAnswer()?.content ?? "" })
  return { copyState }
}
