import type { StreamSseFrame } from "../api/streamSseFrameSchema.js"
import type { JournalEvent } from "../schema/journalEventSchema.js"

type StreamLiveEvent = JournalEvent | StreamSseFrame
type StreamLiveSubscriber = (event: StreamLiveEvent, publishedUserId: string) => void

export function streamLiveSubscriptionCreate() {
  const subscribersByUserId = new Map<string, Set<StreamLiveSubscriber>>()

  const subscribe = (userId: string, subscriber: StreamLiveSubscriber): (() => void) => {
    const subscribers = subscribersByUserId.get(userId) ?? new Set<StreamLiveSubscriber>()
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

  const publish = (userId: string, event: StreamLiveEvent): void => {
    const subscribers = subscribersByUserId.get(userId)
    if (subscribers === undefined) return

    for (const subscriber of [...subscribers]) {
      if (!subscribers.has(subscriber)) continue
      try {
        subscriber(event, userId)
      } catch (_error) {
        // A broken connection must not prevent another connection from receiving the event.
      }
    }
  }

  const subscriberCount = (userId: string): number => subscribersByUserId.get(userId)?.size ?? 0

  return { publish, subscribe, subscriberCount }
}
