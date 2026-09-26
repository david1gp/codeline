import * as v from "valibot"

export const authProvidersResponseSchema = v.strictObject({
  providers: v.array(
    v.strictObject({
      id: v.picklist(["authworks", "legacy", "zitadel"]),
      label: v.pipe(v.string(), v.minLength(1)),
    }),
  ),
})

export type AuthProvidersResponse = v.InferOutput<typeof authProvidersResponseSchema>
