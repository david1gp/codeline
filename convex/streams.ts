import { internalMutationGeneric, internalQueryGeneric, mutationGeneric, queryGeneric } from "convex/server"
import { v } from "convex/values"
import { identityUserRequire } from "../src/identity/convex/identityUserRequire.js"
import { runChildStreamResolve as runChildStreamResolveDomain } from "../src/run/convex/runChildStreamResolve.js"
import { streamAppend as streamAppendDomain } from "../src/stream/convex/streamAppend.js"
import { streamCheckpointAdvance as streamCheckpointAdvanceDomain } from "../src/stream/convex/streamCheckpointAdvance.js"
import { streamCheckpointLoadOrCreate as streamCheckpointLoadOrCreateDomain } from "../src/stream/convex/streamCheckpointLoadOrCreate.js"
import { streamListAfter as streamListAfterDomain } from "../src/stream/convex/streamListAfter.js"
import { streamEventLoad as streamEventLoadDomain } from "../src/stream/convex/streamEventLoad.js"
import { streamLatestEvent as streamLatestEventDomain } from "../src/stream/convex/streamLatestEvent.js"
import { streamReplay as streamReplayDomain } from "../src/stream/convex/streamReplay.js"
import { streamReplayAppend as streamReplayAppendDomain } from "../src/stream/convex/streamReplayAppend.js"
import { streamReplayStart as streamReplayStartDomain } from "../src/stream/convex/streamReplayStart.js"
import { convexJsonValueValidator } from "../src/convex/convexJsonValueValidator.js"

const streamAppendFields = {
  eventType: v.string(),
  idempotencyKey: v.string(),
  payload: convexJsonValueValidator,
  sequence: v.number(),
  streamId: v.string(),
}
const streamReplayFields = {
  afterSequence: v.optional(v.number()),
  inactivityTimeoutMs: v.number(),
  limit: v.optional(v.number()),
}

export const streamAppend = mutationGeneric({
  args: { ...streamAppendFields, sessionId: v.string(), token: v.string() },
  handler: async (context, args) => {
    const identity = await identityUserRequire(context, args.token)
    if (!identity.success) return identity
    return streamAppendDomain(context, identity.data.userId, args.sessionId, args)
  },
})
export const streamListAfter = queryGeneric({
  args: {
    afterSequence: v.number(),
    limit: v.number(),
    sessionId: v.string(),
    streamId: v.string(),
    token: v.string(),
  },
  handler: async (context, args) => {
    const identity = await identityUserRequire(context, args.token)
    if (!identity.success) return identity
    return streamListAfterDomain(context, identity.data.userId, args.sessionId, args.streamId, args)
  },
})
export const streamEventLoadInternal = internalQueryGeneric({
  args: { eventId: v.string(), sessionId: v.string(), streamId: v.string(), userId: v.string() },
  handler: (context, args) => streamEventLoadDomain(context, args.userId, args.sessionId, args.streamId, args.eventId),
})
export const streamLatestEventInternal = internalQueryGeneric({
  args: { lastSequence: v.number(), sessionId: v.string(), streamId: v.string(), userId: v.string() },
  handler: (context, args) =>
    streamLatestEventDomain(context, args.userId, args.sessionId, args.streamId, args.lastSequence),
})
export const streamCheckpointLoadOrCreate = mutationGeneric({
  args: { sessionId: v.string(), streamId: v.string(), token: v.string() },
  handler: async (context, args) => {
    const identity = await identityUserRequire(context, args.token)
    if (!identity.success) return identity
    return streamCheckpointLoadOrCreateDomain(context, identity.data.userId, args.sessionId, args.streamId)
  },
})
export const streamCheckpointAdvance = mutationGeneric({
  args: { lastSequence: v.number(), sessionId: v.string(), streamId: v.string(), token: v.string() },
  handler: async (context, args) => {
    const identity = await identityUserRequire(context, args.token)
    if (!identity.success) return identity
    return streamCheckpointAdvanceDomain(
      context,
      identity.data.userId,
      args.sessionId,
      args.streamId,
      args.lastSequence,
    )
  },
})
export const streamReplay = mutationGeneric({
  args: { ...streamReplayFields, sessionId: v.string(), streamId: v.string(), token: v.string() },
  handler: async (context, args) => {
    const identity = await identityUserRequire(context, args.token)
    if (!identity.success) return identity
    return streamReplayDomain(context, identity.data.userId, args.sessionId, args.streamId, {
      afterSequence: args.afterSequence,
      inactivityTimeoutMs: args.inactivityTimeoutMs,
      limit: args.limit,
    })
  },
})

export const runChildStreamResolve = queryGeneric({
  args: { sessionId: v.string(), streamId: v.string(), token: v.string() },
  handler: async (context, args) => {
    const identity = await identityUserRequire(context, args.token)
    if (!identity.success) return identity
    return runChildStreamResolveDomain(context, identity.data.userId, args.sessionId, args.streamId)
  },
})

export const streamAppendInternal = internalMutationGeneric({
  args: { ...streamAppendFields, sessionId: v.string(), userId: v.string() },
  handler: (context, args) => streamAppendDomain(context, args.userId, args.sessionId, args),
})
export const streamListAfterInternal = internalQueryGeneric({
  args: {
    afterSequence: v.number(),
    limit: v.number(),
    sessionId: v.string(),
    streamId: v.string(),
    userId: v.string(),
  },
  handler: (context, args) => streamListAfterDomain(context, args.userId, args.sessionId, args.streamId, args),
})
export const streamCheckpointLoadOrCreateInternal = internalMutationGeneric({
  args: { sessionId: v.string(), streamId: v.string(), userId: v.string() },
  handler: (context, args) => streamCheckpointLoadOrCreateDomain(context, args.userId, args.sessionId, args.streamId),
})
export const streamCheckpointAdvanceInternal = internalMutationGeneric({
  args: { lastSequence: v.number(), sessionId: v.string(), streamId: v.string(), userId: v.string() },
  handler: (context, args) =>
    streamCheckpointAdvanceDomain(context, args.userId, args.sessionId, args.streamId, args.lastSequence),
})
export const streamReplayStartInternal = internalMutationGeneric({
  args: { sessionId: v.string(), streamId: v.string(), userId: v.string() },
  handler: (context, args) => streamReplayStartDomain(context, args.userId, args.sessionId, args.streamId),
})
export const streamReplayAppendInternal = internalMutationGeneric({
  args: { ...streamAppendFields, inactivityTimeoutMs: v.number(), sessionId: v.string(), userId: v.string() },
  handler: (context, args) =>
    streamReplayAppendDomain(context, args.userId, args.sessionId, args, args.inactivityTimeoutMs),
})
export const streamReplayInternal = internalMutationGeneric({
  args: { ...streamReplayFields, sessionId: v.string(), streamId: v.string(), userId: v.string() },
  handler: (context, args) =>
    streamReplayDomain(context, args.userId, args.sessionId, args.streamId, {
      afterSequence: args.afterSequence,
      inactivityTimeoutMs: args.inactivityTimeoutMs,
      limit: args.limit,
    }),
})
export const runChildStreamResolveInternal = internalQueryGeneric({
  args: { sessionId: v.string(), streamId: v.string(), userId: v.string() },
  handler: (context, args) => runChildStreamResolveDomain(context, args.userId, args.sessionId, args.streamId),
})
