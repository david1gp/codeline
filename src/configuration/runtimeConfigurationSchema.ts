import * as v from "valibot"
import { oidcProviderConfigurationSchema } from "./oidcProviderConfigurationSchema.js"

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
  oidcProviders: v.optional(
    v.object({
      authworks: v.optional(oidcProviderConfigurationSchema),
      legacy: v.optional(oidcProviderConfigurationSchema),
      zitadel: v.optional(oidcProviderConfigurationSchema),
    }),
  ),
  oidcCallbackUrl: v.optional(v.pipe(v.string(), v.url())),
  oidcClientId: v.optional(v.pipe(v.string(), v.minLength(1))),
  oidcClientSecret: v.optional(v.pipe(v.string(), v.minLength(1))),
  oidcIssuer: v.optional(v.pipe(v.string(), v.url())),
  oidcOrganizationId: v.optional(v.pipe(v.string(), v.minLength(1))),
  publicOrigin: v.optional(v.pipe(v.string(), v.url())),
  sessionsSidebarPageSize: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1)), 25),
})

export type RuntimeConfiguration = Omit<v.InferOutput<typeof runtimeConfigurationSchema>, "sessionsSidebarPageSize"> & {
  sessionsSidebarPageSize?: number
}
