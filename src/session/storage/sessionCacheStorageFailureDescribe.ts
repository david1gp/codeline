export function sessionCacheStorageFailureDescribe(error: unknown) {
  const errorName =
    error !== null && typeof error === "object" && "name" in error && typeof error.name === "string" ? error.name : ""
  const errorMessage = error instanceof Error ? error.message.toLowerCase() : ""

  if (errorName === "QuotaExceededError" || errorMessage.includes("quota")) return { kind: "quota" as const }
  if (
    errorName === "VersionError" ||
    errorName === "NotFoundError" ||
    errorMessage.includes("schema") ||
    errorMessage.includes("version")
  )
    return { kind: "schema" as const }
  if (
    errorName === "AbortError" ||
    errorName === "InvalidStateError" ||
    errorName === "TransactionInactiveError" ||
    errorMessage.includes("transaction")
  )
    return { kind: "transaction" as const }
  return { kind: "unknown" as const }
}
