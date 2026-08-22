import { internalMutationGeneric, internalQueryGeneric, mutationGeneric, queryGeneric } from "convex/server"
import { v } from "convex/values"
import { identityUserRequire } from "../src/identity/convex/identityUserRequire.js"
import { runBudgetValidator } from "../src/run/convex/runBudgetValidator.js"
import { runCancel as runCancelDomain } from "../src/run/convex/runCancel.js"
import { runChildCreate as runChildCreateDomain } from "../src/run/convex/runChildCreate.js"
import { runChildStreamResolve as runChildStreamResolveDomain } from "../src/run/convex/runChildStreamResolve.js"
import { runCreate as runCreateDomain } from "../src/run/convex/runCreate.js"
import { runDelegationFinalize as runDelegationFinalizeDomain } from "../src/run/convex/runDelegationFinalize.js"
import { runLoad as runLoadDomain } from "../src/run/convex/runLoad.js"
import { runRetryAttemptCreate as runRetryAttemptCreateDomain } from "../src/run/convex/runRetryAttemptCreate.js"
import { runTransition as runTransitionDomain } from "../src/run/convex/runTransition.js"
import { runDelegationResultValidator } from "../src/run/convex/runDelegationResultValidator.js"
import { runExecutionSnapshotValidator } from "../src/run/convex/runExecutionSnapshotValidator.js"
import { runFailureMetadataValidator } from "../src/run/convex/runFailureMetadataValidator.js"
import { runStatusValidator } from "../src/run/convex/runStatusValidator.js"

const runCreateFields = {
  budget: v.optional(runBudgetValidator),
  clientRunId: v.string(),
  snapshot: runExecutionSnapshotValidator,
  streamId: v.string(),
}
const runTransitionFields = { failure: v.optional(runFailureMetadataValidator), status: runStatusValidator }
const runChildCreateFields = {
  delegationKey: v.string(),
  parentAttemptId: v.string(),
  parentRunId: v.string(),
  snapshot: v.optional(runExecutionSnapshotValidator),
  task: v.string(),
}

export const runCreate = mutationGeneric({
  args: { ...runCreateFields, sessionId: v.string(), token: v.string() },
  handler: async (context, args) => {
    const identity = await identityUserRequire(context, args.token)
    if (!identity.success) return identity
    return runCreateDomain(context, identity.data.userId, args.sessionId, {
      budget: args.budget,
      clientRunId: args.clientRunId,
      snapshot: args.snapshot,
      streamId: args.streamId,
    })
  },
})
export const runLoad = queryGeneric({
  args: { clientRunId: v.string(), sessionId: v.string(), token: v.string() },
  handler: async (context, args) => {
    const identity = await identityUserRequire(context, args.token)
    if (!identity.success) return identity
    return runLoadDomain(context, identity.data.userId, args.sessionId, args.clientRunId)
  },
})
export const runTransition = mutationGeneric({
  args: { ...runTransitionFields, runId: v.string(), sessionId: v.string(), token: v.string() },
  handler: async (context, args) => {
    const identity = await identityUserRequire(context, args.token)
    if (!identity.success) return identity
    return runTransitionDomain(context, identity.data.userId, args.sessionId, args.runId, {
      ...(args.failure === undefined ? {} : { failure: args.failure }),
      status: args.status,
    })
  },
})
export const runCancel = mutationGeneric({
  args: { kind: v.optional(v.literal("requested")), runId: v.string(), sessionId: v.string(), token: v.string() },
  handler: async (context, args) => {
    const identity = await identityUserRequire(context, args.token)
    if (!identity.success) return identity
    return runCancelDomain(context, identity.data.userId, args.sessionId, args.runId, {
      ...(args.kind === undefined ? {} : { kind: args.kind }),
    })
  },
})
export const runRetryAttemptCreate = mutationGeneric({
  args: { runId: v.string(), sessionId: v.string(), token: v.string() },
  handler: async (context, args) => {
    const identity = await identityUserRequire(context, args.token)
    if (!identity.success) return identity
    return runRetryAttemptCreateDomain(context, identity.data.userId, args.sessionId, args.runId)
  },
})
export const runChildCreate = mutationGeneric({
  args: { ...runChildCreateFields, sessionId: v.string(), token: v.string() },
  handler: async (context, args) => {
    const identity = await identityUserRequire(context, args.token)
    if (!identity.success) return identity
    return runChildCreateDomain(context, identity.data.userId, args.sessionId, {
      delegationKey: args.delegationKey,
      parentAttemptId: args.parentAttemptId,
      parentRunId: args.parentRunId,
      ...(args.snapshot === undefined ? {} : { snapshot: args.snapshot }),
      task: args.task,
    })
  },
})
export const runDelegationFinalize = mutationGeneric({
  args: { delegationId: v.string(), result: runDelegationResultValidator, sessionId: v.string(), token: v.string() },
  handler: async (context, args) => {
    const identity = await identityUserRequire(context, args.token)
    if (!identity.success) return identity
    return runDelegationFinalizeDomain(context, identity.data.userId, args.sessionId, args.delegationId, args.result)
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

export const runCreateInternal = internalMutationGeneric({
  args: { ...runCreateFields, sessionId: v.string(), userId: v.string() },
  handler: (context, args) =>
    runCreateDomain(context, args.userId, args.sessionId, {
      budget: args.budget,
      clientRunId: args.clientRunId,
      snapshot: args.snapshot,
      streamId: args.streamId,
    }),
})
export const runLoadInternal = internalQueryGeneric({
  args: { clientRunId: v.string(), sessionId: v.string(), userId: v.string() },
  handler: (context, args) => runLoadDomain(context, args.userId, args.sessionId, args.clientRunId),
})
export const runTransitionInternal = internalMutationGeneric({
  args: { ...runTransitionFields, runId: v.string(), sessionId: v.string(), userId: v.string() },
  handler: (context, args) =>
    runTransitionDomain(context, args.userId, args.sessionId, args.runId, {
      ...(args.failure === undefined ? {} : { failure: args.failure }),
      status: args.status,
    }),
})
export const runCancelInternal = internalMutationGeneric({
  args: { kind: v.optional(v.literal("requested")), runId: v.string(), sessionId: v.string(), userId: v.string() },
  handler: (context, args) =>
    runCancelDomain(context, args.userId, args.sessionId, args.runId, {
      ...(args.kind === undefined ? {} : { kind: args.kind }),
    }),
})
export const runRetryAttemptCreateInternal = internalMutationGeneric({
  args: { now: v.optional(v.number()), runId: v.string(), sessionId: v.string(), userId: v.string() },
  handler: (context, args) =>
    runRetryAttemptCreateDomain(context, args.userId, args.sessionId, args.runId, { now: args.now }),
})
export const runChildCreateInternal = internalMutationGeneric({
  args: { ...runChildCreateFields, sessionId: v.string(), userId: v.string() },
  handler: (context, args) =>
    runChildCreateDomain(context, args.userId, args.sessionId, {
      delegationKey: args.delegationKey,
      parentAttemptId: args.parentAttemptId,
      parentRunId: args.parentRunId,
      ...(args.snapshot === undefined ? {} : { snapshot: args.snapshot }),
      task: args.task,
    }),
})
export const runDelegationFinalizeInternal = internalMutationGeneric({
  args: { delegationId: v.string(), result: runDelegationResultValidator, sessionId: v.string(), userId: v.string() },
  handler: (context, args) =>
    runDelegationFinalizeDomain(context, args.userId, args.sessionId, args.delegationId, args.result),
})
export const runChildStreamResolveInternal = internalQueryGeneric({
  args: { sessionId: v.string(), streamId: v.string(), userId: v.string() },
  handler: (context, args) => runChildStreamResolveDomain(context, args.userId, args.sessionId, args.streamId),
})
