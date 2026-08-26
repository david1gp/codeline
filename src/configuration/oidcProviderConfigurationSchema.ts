import * as v from "valibot"

export const oidcProviderConfigurationSchema = v.object({
  callbackUrl: v.optional(v.pipe(v.string(), v.url())),
  clientId: v.optional(v.pipe(v.string(), v.minLength(1))),
  clientSecret: v.optional(v.pipe(v.string(), v.minLength(1))),
  issuer: v.optional(v.pipe(v.string(), v.url())),
  organizationId: v.optional(v.pipe(v.string(), v.minLength(1))),
})

export type OidcProviderConfiguration = v.InferOutput<typeof oidcProviderConfigurationSchema>
