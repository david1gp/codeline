import { internalMutationGeneric, internalQueryGeneric, mutationGeneric, queryGeneric } from "convex/server"
import { v } from "convex/values"
import { identityUserRequire } from "../src/identity/convex/identityUserRequire.js"
import { noteCreate as noteCreateDomain } from "../src/note/convex/noteCreate.js"
import { noteDelete as noteDeleteDomain } from "../src/note/convex/noteDelete.js"
import { noteDetail as noteDetailDomain } from "../src/note/convex/noteDetail.js"
import { noteList as noteListDomain } from "../src/note/convex/noteList.js"
import { noteLoad as noteLoadDomain } from "../src/note/convex/noteLoad.js"
import { noteReorder as noteReorderDomain } from "../src/note/convex/noteReorder.js"
import { noteUpdate as noteUpdateDomain } from "../src/note/convex/noteUpdate.js"

const noteProjectPathValidator = v.union(v.string(), v.null())
const noteDirectionValidator = v.union(v.literal("up"), v.literal("down"))
const noteCreateFields = {
  content: v.string(),
  createdAt: v.number(),
  id: v.string(),
  projectPath: noteProjectPathValidator,
  updatedAt: v.number(),
}
const noteUpdateFields = {
  content: v.string(),
  id: v.string(),
  projectPath: noteProjectPathValidator,
  updatedAt: v.number(),
}
const noteReorderFields = {
  direction: noteDirectionValidator,
  id: v.string(),
  projectPath: noteProjectPathValidator,
}

export const noteList = queryGeneric({
  args: { token: v.string() },
  handler: async (context, args) => {
    const identity = await identityUserRequire(context, args.token)
    if (!identity.success) return identity
    return noteListDomain(context, identity.data.userId)
  },
})

export const noteLoad = queryGeneric({
  args: { noteId: v.string(), token: v.string() },
  handler: async (context, args) => {
    const identity = await identityUserRequire(context, args.token)
    if (!identity.success) return identity
    return noteLoadDomain(context, identity.data.userId, args.noteId)
  },
})

export const noteDetail = queryGeneric({
  args: { noteId: v.string(), token: v.string() },
  handler: async (context, args) => {
    const identity = await identityUserRequire(context, args.token)
    if (!identity.success) return identity
    return noteDetailDomain(context, identity.data.userId, args.noteId)
  },
})

export const noteCreate = mutationGeneric({
  args: { ...noteCreateFields, token: v.string() },
  handler: async (context, args) => {
    const identity = await identityUserRequire(context, args.token)
    if (!identity.success) return identity
    return noteCreateDomain(context, identity.data.userId, args)
  },
})

export const noteUpdate = mutationGeneric({
  args: { ...noteUpdateFields, token: v.string() },
  handler: async (context, args) => {
    const identity = await identityUserRequire(context, args.token)
    if (!identity.success) return identity
    return noteUpdateDomain(context, identity.data.userId, args)
  },
})

export const noteDelete = mutationGeneric({
  args: { noteId: v.string(), token: v.string() },
  handler: async (context, args) => {
    const identity = await identityUserRequire(context, args.token)
    if (!identity.success) return identity
    return noteDeleteDomain(context, identity.data.userId, args.noteId)
  },
})

export const noteReorder = mutationGeneric({
  args: { ...noteReorderFields, token: v.string() },
  handler: async (context, args) => {
    const identity = await identityUserRequire(context, args.token)
    if (!identity.success) return identity
    return noteReorderDomain(context, identity.data.userId, args)
  },
})

export const noteListInternal = internalQueryGeneric({
  args: { userId: v.string() },
  handler: (context, args) => noteListDomain(context, args.userId),
})

export const noteLoadInternal = internalQueryGeneric({
  args: { noteId: v.string(), userId: v.string() },
  handler: (context, args) => noteLoadDomain(context, args.userId, args.noteId),
})

export const noteDetailInternal = internalQueryGeneric({
  args: { noteId: v.string(), userId: v.string() },
  handler: (context, args) => noteDetailDomain(context, args.userId, args.noteId),
})

export const noteCreateInternal = internalMutationGeneric({
  args: { ...noteCreateFields, userId: v.string() },
  handler: (context, args) => noteCreateDomain(context, args.userId, args),
})

export const noteUpdateInternal = internalMutationGeneric({
  args: { ...noteUpdateFields, userId: v.string() },
  handler: (context, args) => noteUpdateDomain(context, args.userId, args),
})

export const noteDeleteInternal = internalMutationGeneric({
  args: { noteId: v.string(), userId: v.string() },
  handler: (context, args) => noteDeleteDomain(context, args.userId, args.noteId),
})

export const noteReorderInternal = internalMutationGeneric({
  args: { ...noteReorderFields, userId: v.string() },
  handler: (context, args) => noteReorderDomain(context, args.userId, args),
})
