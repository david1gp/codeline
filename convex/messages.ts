import { internalMutationGeneric, internalQueryGeneric, mutationGeneric, queryGeneric } from "convex/server"
import { v } from "convex/values"
import { identityUserRequire } from "../src/identity/convex/identityUserRequire.js"
import { messageAppend as messageAppendDomain } from "../src/message/convex/messageAppend.js"
import { messageCopyFinalizedPrefix as messageCopyFinalizedPrefixDomain } from "../src/message/convex/messageCopyFinalizedPrefix.js"
import { messageListFinalized as messageListFinalizedDomain } from "../src/message/convex/messageListFinalized.js"
import { messageLoadDurableHistory as messageLoadDurableHistoryDomain } from "../src/message/convex/messageLoadDurableHistory.js"
import { messagePrepare as messagePrepareDomain } from "../src/message/convex/messagePrepare.js"

const messageAppendFields = {
  clientRequestId: v.string(),
  content: v.string(),
  role: v.union(v.literal("assistant"), v.literal("user")),
}

const messageListFields = { cursor: v.optional(v.string()), limit: v.number() }

export const messageAppend = mutationGeneric({
  args: { ...messageAppendFields, sessionId: v.string(), token: v.string() },
  handler: async (context, args) => {
    const identity = await identityUserRequire(context, args.token)
    if (!identity.success) return identity
    return messageAppendDomain(context, identity.data.userId, args.sessionId, args)
  },
})

export const messageLoadDurableHistory = queryGeneric({
  args: { sessionId: v.string(), token: v.string() },
  handler: async (context, args) => {
    const identity = await identityUserRequire(context, args.token)
    if (!identity.success) return identity
    return messageLoadDurableHistoryDomain(context, identity.data.userId, args.sessionId)
  },
})

export const messageListFinalized = queryGeneric({
  args: { ...messageListFields, sessionId: v.string(), token: v.string() },
  handler: async (context, args) => {
    const identity = await identityUserRequire(context, args.token)
    if (!identity.success) return identity
    return messageListFinalizedDomain(context, identity.data.userId, args.sessionId, {
      ...(args.cursor === undefined ? {} : { cursor: args.cursor }),
      limit: args.limit,
    })
  },
})

export const messageCopyFinalizedPrefix = mutationGeneric({
  args: { messageId: v.string(), sourceSessionId: v.string(), targetSessionId: v.string(), token: v.string() },
  handler: async (context, args) => {
    const identity = await identityUserRequire(context, args.token)
    if (!identity.success) return identity
    return messageCopyFinalizedPrefixDomain(
      context,
      identity.data.userId,
      args.sourceSessionId,
      args.targetSessionId,
      args.messageId,
    )
  },
})

export const messagePrepareInternal = internalMutationGeneric({
  args: { clientRequestId: v.string(), content: v.string(), sessionId: v.string(), userId: v.string() },
  handler: (context, args) => messagePrepareDomain(context, args.userId, args.sessionId, args),
})

export const messageAppendInternal = internalMutationGeneric({
  args: { ...messageAppendFields, sessionId: v.string(), userId: v.string() },
  handler: (context, args) => messageAppendDomain(context, args.userId, args.sessionId, args),
})

export const messageLoadDurableHistoryInternal = internalQueryGeneric({
  args: { sessionId: v.string(), userId: v.string() },
  handler: (context, args) => messageLoadDurableHistoryDomain(context, args.userId, args.sessionId),
})

export const messageListFinalizedInternal = internalQueryGeneric({
  args: { ...messageListFields, sessionId: v.string(), userId: v.string() },
  handler: (context, args) =>
    messageListFinalizedDomain(context, args.userId, args.sessionId, {
      ...(args.cursor === undefined ? {} : { cursor: args.cursor }),
      limit: args.limit,
    }),
})

export const messageCopyFinalizedPrefixInternal = internalMutationGeneric({
  args: { messageId: v.string(), sourceSessionId: v.string(), targetSessionId: v.string(), userId: v.string() },
  handler: (context, args) =>
    messageCopyFinalizedPrefixDomain(context, args.userId, args.sourceSessionId, args.targetSessionId, args.messageId),
})
