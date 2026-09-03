import type { SessionDetailSseFrame } from "../src/session/api/sessionDetailSseFrameSchema.js"
import type { GlobalSummarySseFrame } from "../src/stream/api/globalSummarySseFrameSchema.js"
import type { StreamSseConnectionWriterSource } from "../src/stream/actions/streamSseConnectionWriterSource.js"

type StreamSseConnectionWriterTestEvent = GlobalSummarySseFrame | SessionDetailSseFrame
type StreamSseConnectionWriterTestSubscription = StreamSseConnectionWriterSource<StreamSseConnectionWriterTestEvent> & {
  publish: (userId: string, event: StreamSseConnectionWriterTestEvent) => void
  subscriberCount: (userId: string) => number
}

export function streamSseConnectionWriterTestSubscriptionCreate(): StreamSseConnectionWriterTestSubscription {
  const subscribersByUserId = new Map<string, Set<(event: StreamSseConnectionWriterTestEvent) => void>>()
  const subscribe = (userId: string, subscriber: (event: StreamSseConnectionWriterTestEvent) => void): (() => void) => {
    const subscribers =
      subscribersByUserId.get(userId) ?? new Set<(event: StreamSseConnectionWriterTestEvent) => void>()
    subscribers.add(subscriber)
    subscribersByUserId.set(userId, subscribers)

    let subscribed = true
    return () => {
      if (!subscribed) return
      subscribed = false
      subscribers.delete(subscriber)
      if (subscribers.size === 0 && subscribersByUserId.get(userId) === subscribers) subscribersByUserId.delete(userId)
    }
  }
  const publish = (userId: string, event: StreamSseConnectionWriterTestEvent): void => {
    for (const subscriber of [...(subscribersByUserId.get(userId) ?? [])]) subscriber(event)
  }
  const subscriberCount = (userId: string): number => subscribersByUserId.get(userId)?.size ?? 0
  return { publish, subscribe, subscriberCount }
}
