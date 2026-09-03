import * as v from "valibot"
import type { GlobalSummarySseFrame } from "../api/globalSummarySseFrameSchema.js"
import { globalSummarySseFrameSchema } from "../api/globalSummarySseFrameSchema.js"
import type { SessionDetailSseFrame } from "../../session/api/sessionDetailSseFrameSchema.js"
import { sessionDetailSseFrameSchema } from "../../session/api/sessionDetailSseFrameSchema.js"

type GlobalSummarySubscriber = (event: GlobalSummarySseFrame, publishedUserId: string) => void
type SelectedSessionDetailSubscriber = (event: SessionDetailSseFrame, publishedUserId: string) => void

function streamLiveChannelCreate<T>(subscriberErrorHandler: (error: unknown) => void) {
  const subscribersByUserId = new Map<string, Set<(event: T, publishedUserId: string) => void>>()

  const subscribe = (userId: string, subscriber: (event: T, publishedUserId: string) => void): (() => void) => {
    const subscribers = subscribersByUserId.get(userId) ?? new Set<(event: T, publishedUserId: string) => void>()
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

  const publish = (userId: string, event: T): void => {
    const subscribers = subscribersByUserId.get(userId)
    if (subscribers === undefined) return

    for (const subscriber of [...subscribers]) {
      if (!subscribers.has(subscriber)) continue
      try {
        subscriber(event, userId)
      } catch (error) {
        subscriberErrorHandler(error)
      }
    }
  }

  const subscriberCount = (userId: string): number => subscribersByUserId.get(userId)?.size ?? 0

  return { publish, subscribe, subscriberCount }
}

function streamLiveSessionChannelCreate<T>(subscriberErrorHandler: (error: unknown) => void) {
  const subscribersBySessionKey = new Map<string, Set<(event: T, publishedUserId: string) => void>>()
  const sessionKeyCreate = (userId: string, sessionId: string): string => `${userId}\u0000${sessionId}`

  const subscribe = (
    userId: string,
    sessionId: string,
    subscriber: (event: T, publishedUserId: string) => void,
  ): (() => void) => {
    const key = sessionKeyCreate(userId, sessionId)
    const subscribers = subscribersBySessionKey.get(key) ?? new Set<(event: T, publishedUserId: string) => void>()
    subscribers.add(subscriber)
    subscribersBySessionKey.set(key, subscribers)

    let subscribed = true
    return () => {
      if (!subscribed) return
      subscribed = false
      subscribers.delete(subscriber)
      if (subscribers.size === 0 && subscribersBySessionKey.get(key) === subscribers)
        subscribersBySessionKey.delete(key)
    }
  }

  const publish = (userId: string, sessionId: string, event: T): void => {
    const subscribers = subscribersBySessionKey.get(sessionKeyCreate(userId, sessionId))
    if (subscribers === undefined) return

    for (const subscriber of [...subscribers]) {
      if (!subscribers.has(subscriber)) continue
      try {
        subscriber(event, userId)
      } catch (error) {
        subscriberErrorHandler(error)
      }
    }
  }

  const subscriberCount = (userId: string, sessionId: string): number =>
    subscribersBySessionKey.get(sessionKeyCreate(userId, sessionId))?.size ?? 0

  return { publish, subscribe, subscriberCount }
}

export function streamLiveSubscriptionCreate() {
  const subscriberErrorHandler = (_error: unknown): void => {
    // A broken connection must not prevent another connection from receiving the event.
  }
  const globalSummaryChannel = streamLiveChannelCreate<GlobalSummarySseFrame>(subscriberErrorHandler)
  const selectedSessionDetailChannel = streamLiveSessionChannelCreate<SessionDetailSseFrame>(subscriberErrorHandler)
  const globalSummaryPublish = (userId: string, event: GlobalSummarySseFrame): void => {
    const parsed = v.safeParse(globalSummarySseFrameSchema, event)
    if (!parsed.success) return
    globalSummaryChannel.publish(userId, parsed.output)
  }
  const selectedSessionDetailPublish = (userId: string, sessionId: string, event: SessionDetailSseFrame): void => {
    const parsed = v.safeParse(sessionDetailSseFrameSchema, event)
    if (!parsed.success || parsed.output.data.sessionId !== sessionId) return
    selectedSessionDetailChannel.publish(userId, sessionId, parsed.output)
  }

  return {
    globalSummaryPublish,
    globalSummarySubscribe: globalSummaryChannel.subscribe,
    globalSummarySubscriberCount: globalSummaryChannel.subscriberCount,
    selectedSessionDetailPublish,
    selectedSessionDetailSubscribe: selectedSessionDetailChannel.subscribe,
    selectedSessionDetailSubscriberCount: selectedSessionDetailChannel.subscriberCount,
  } satisfies {
    globalSummaryPublish: (userId: string, event: GlobalSummarySseFrame) => void
    globalSummarySubscribe: (userId: string, subscriber: GlobalSummarySubscriber) => () => void
    globalSummarySubscriberCount: (userId: string) => number
    selectedSessionDetailPublish: (userId: string, sessionId: string, event: SessionDetailSseFrame) => void
    selectedSessionDetailSubscribe: (
      userId: string,
      sessionId: string,
      subscriber: SelectedSessionDetailSubscriber,
    ) => () => void
    selectedSessionDetailSubscriberCount: (userId: string, sessionId: string) => number
  }
}
