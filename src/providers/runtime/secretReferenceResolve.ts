import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import { secretReferenceSchema } from "../schema/secretReferenceSchema.js"

const providerSecretEnvironmentNames = ["CLIPROXYAPI_API_KEY", "CODEX_LB_API_TOKEN"] as const

type ProviderSecretEnvironmentName = (typeof providerSecretEnvironmentNames)[number]

const providerSecretEnvironmentNameSet = new Set<string>(providerSecretEnvironmentNames)

type ResolvedSecret = {
  readonly value: string
}

function resolvedSecretCreate(value: string): ResolvedSecret {
  const secret = Object.create(null) as ResolvedSecret & { toJSON: () => string }
  Object.defineProperty(secret, "value", { enumerable: false, value })
  Object.defineProperty(secret, "toJSON", { enumerable: false, value: () => "[REDACTED]" })
  return secret
}

export function secretReferenceResolve(
  reference: unknown,
  environment: Readonly<Record<string, string | undefined>>,
): Result<ResolvedSecret> {
  const op = "secretReferenceResolve"
  const parsed = v.safeParse(secretReferenceSchema, reference)
  if (!parsed.success) return createResultError(op, "The secret reference is invalid.")

  const environmentName = parsed.output.slice(1) as string
  if (!providerSecretEnvironmentNameSet.has(environmentName)) {
    return createResultError(op, "The secret reference is not allowed.")
  }

  if (!Object.hasOwn(environment, environmentName)) {
    return createResultError(op, "The referenced secret is unavailable.")
  }

  const value = environment[environmentName as ProviderSecretEnvironmentName]
  if (typeof value !== "string" || value.length === 0) {
    return createResultError(op, "The referenced secret is unavailable.")
  }
  return createResult(resolvedSecretCreate(value))
}
