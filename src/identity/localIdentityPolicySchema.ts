import * as v from "valibot"

// These are already-provisioned internal IDs, not claims supplied by a request.
export const localIdentityPolicySchema = v.strictObject({
  userId: v.pipe(v.string(), v.trim(), v.minLength(1)),
  organizationId: v.pipe(v.string(), v.trim(), v.minLength(1)),
})

export type LocalIdentityPolicy = v.InferOutput<typeof localIdentityPolicySchema>
