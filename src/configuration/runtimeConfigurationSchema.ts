import * as v from "valibot"

export const runtimeConfigurationSchema = v.object({
  authMode: v.optional(v.picklist(["development", "oidc"])),
  databaseUrl: v.pipe(v.string(), v.url()),
  developmentIdentity: v.optional(
    v.object({
      email: v.optional(v.pipe(v.string(), v.email())),
      identityKey: v.pipe(v.string(), v.minLength(1)),
      displayName: v.pipe(v.string(), v.minLength(1)),
    }),
  ),
  nodeEnv: v.picklist(["development", "test", "production"]),
  oidcCallbackUrl: v.optional(v.pipe(v.string(), v.url())),
  oidcClientId: v.optional(v.pipe(v.string(), v.minLength(1))),
  oidcClientSecret: v.optional(v.pipe(v.string(), v.minLength(1))),
  oidcIssuer: v.optional(v.pipe(v.string(), v.url())),
  publicOrigin: v.optional(v.pipe(v.string(), v.url())),
})

export type RuntimeConfiguration = v.InferOutput<typeof runtimeConfigurationSchema>
