import { useContext } from "solid-js"
import { finalizedMessageCopyStateCreate } from "../message/ui/finalizedMessageCopyStateCreate.js"
import { sessionBoundedHistoryStateCreate } from "../session/client/sessionBoundedHistoryStateCreate.js"
import { apiFetchContext } from "./apiFetchContext.js"

export function childSessionConversationStateCreate(sessionId: () => string) {
  const fetcher = useContext(apiFetchContext)
  const history = sessionBoundedHistoryStateCreate({
    ...(fetcher === undefined ? {} : { fetch: fetcher }),
    sessionId,
  })
  const copyState = finalizedMessageCopyStateCreate({ content: () => history.latestAnswer()?.content ?? "" })
  return { copyState, history }
}
