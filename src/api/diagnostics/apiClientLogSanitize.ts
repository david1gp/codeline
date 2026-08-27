import { apiDiagnosticsLimits } from "./apiDiagnosticsLimits.js"

const redactedValue = "[REDACTED]"
const circularValue = "[CIRCULAR]"
const unsupportedValue = "[UNSERIALIZABLE]"
const truncatedValue = "[TRUNCATED]"
const relativeUrlBase = "https://codeline.invalid"
const urlPattern = /\b(?:https?|wss?):\/\/[^\s"'<>]+/giu
const relativeUrlPattern = /(^|[\s([{"'])(\/[^\s"'<>?#]+)(?:\?[^\s"'<>#]*)?(?:#[^\s"'<>]*)?/gu
const bearerPattern = /\bBearer\s+[A-Za-z0-9._~+/=-]+/giu
const inlineSecretPattern =
  /\b(authorization|proxy-authorization|cookie|set-cookie|password|passwd|secret|token|api[-_ ]?key|access[-_ ]?(?:key|token)|client[-_ ]?secret|refresh[-_ ]?token|id[-_ ]?token|credential|body|request[-_ ]?body|response[-_ ]?body|payload|query(?:[-_ ]?(?:string|params|parameters))?|search(?:[-_ ]?params)?|fragment|hash)\b(\s*[:=]\s*)(?:"[^"]*"|'[^']*'|\S+)/giu
const redactedKeyPattern =
  /(?:authorization|proxy-authorization|cookie|set-cookie|password|passwd|secret|token|api[-_ ]?key|access[-_ ]?(?:key|token)|client[-_ ]?secret|refresh[-_ ]?token|id[-_ ]?(?:token|secret)|session[-_ ]?(?:id|token)|credential|body|request[-_ ]?body|response[-_ ]?body|payload|query(?:[-_ ]?(?:string|params|parameters))?|search(?:[-_ ]?params)?|fragment|hash)/iu
const quotedInlineSecretPattern =
  /(["'])(authorization|proxy-authorization|cookie|set-cookie|password|passwd|secret|token|api[-_ ]?key|access[-_ ]?(?:key|token)|client[-_ ]?secret|refresh[-_ ]?token|id[-_ ]?(?:token|secret)|session[-_ ]?(?:id|token)|credential|body|request[-_ ]?body|response[-_ ]?body|payload|query(?:[-_ ]?(?:string|params|parameters))?|search(?:[-_ ]?params)?|fragment|hash)\1(\s*:\s*)(["'])[^"']*\4/giu
const urlKeyPattern = /(?:url|uri|href|location)$/iu

type SanitizeState = {
  nodes: number
  seen: WeakSet<object>
}

export function apiClientLogSanitize(input: unknown): unknown {
  return valueSanitize(input, 0, { nodes: 0, seen: new WeakSet<object>() })
}

function valueSanitize(value: unknown, depth: number, state: SanitizeState): unknown {
  state.nodes += 1
  if (state.nodes > apiDiagnosticsLimits.maxStructuredNodes) return truncatedValue
  if (value === null || typeof value === "boolean" || typeof value === "number")
    return typeof value === "number" && !Number.isFinite(value) ? unsupportedValue : value
  if (typeof value === "string") return stringSanitize(value)
  if (typeof value !== "object") return unsupportedValue
  if (depth >= apiDiagnosticsLimits.maxStructuredDepth) return truncatedValue
  if (state.seen.has(value)) return circularValue
  state.seen.add(value)

  try {
    if (Array.isArray(value)) return arraySanitize(value, depth, state)
    return objectSanitize(value, depth, state)
  } catch (_error) {
    return unsupportedValue
  } finally {
    state.seen.delete(value)
  }
}

function arraySanitize(value: readonly unknown[], depth: number, state: SanitizeState): unknown[] {
  const output: unknown[] = []
  const length = Math.min(value.length, apiDiagnosticsLimits.maxStructuredEntries)
  for (let index = 0; index < length; index += 1) output.push(valueSanitize(value[index], depth + 1, state))
  if (value.length > length) output.push(truncatedValue)
  return output
}

function objectSanitize(value: object, depth: number, state: SanitizeState): Record<string, unknown> {
  const output: Record<string, unknown> = Object.create(null) as Record<string, unknown>
  const keys = Object.keys(value)
  const length = Math.min(keys.length, apiDiagnosticsLimits.maxStructuredEntries)
  for (let index = 0; index < length; index += 1) {
    const key = keys[index]
    if (key === undefined) continue
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    const descriptorValue = descriptor?.value
    const child =
      descriptor === undefined || descriptor.get !== undefined || descriptor.set !== undefined
        ? unsupportedValue
        : redactedKeyPattern.test(key)
          ? redactedValue
          : urlKeyPattern.test(key) && typeof descriptorValue === "string"
            ? urlSanitize(descriptorValue)
            : valueSanitize(descriptorValue, depth + 1, state)
    Object.defineProperty(output, keySanitize(key), {
      configurable: true,
      enumerable: true,
      value: child,
      writable: true,
    })
  }
  if (keys.length > length) output["..."] = truncatedValue
  return output
}

function keySanitize(key: string): string {
  return controlCharactersRemove(key).slice(0, apiDiagnosticsLimits.maxStructuredStringLength)
}

function stringSanitize(value: string): string {
  const withoutUrls = value.replace(urlPattern, (url) => urlSanitize(url))
  const withoutRelativeUrls = withoutUrls.replace(relativeUrlPattern, (_match, prefix, path) => `${prefix}${path}`)
  const withoutBearer = withoutRelativeUrls.replace(bearerPattern, redactedValue)
  const withoutQuotedInlineSecrets = withoutBearer.replace(
    quotedInlineSecretPattern,
    (_match, quote, name, separator, valueQuote) =>
      `${quote}${name}${quote}${separator}${valueQuote}${redactedValue}${valueQuote}`,
  )
  const withoutInlineSecrets = withoutQuotedInlineSecrets.replace(inlineSecretPattern, (_match, name, separator) => {
    return `${name}${separator}${redactedValue}`
  })
  return controlCharactersRemove(withoutInlineSecrets).slice(0, apiDiagnosticsLimits.maxStructuredStringLength)
}

function urlSanitize(value: string): string {
  const isRelative = !/^[a-z][a-z\d+.-]*:/iu.test(value)
  if (isRelative && !/^[/?#]/u.test(value)) {
    const queryOrFragmentIndex = value.search(/[?#]/u)
    return stringSanitize(queryOrFragmentIndex < 0 ? value : value.slice(0, queryOrFragmentIndex))
  }

  try {
    const parsed = new URL(value, relativeUrlBase)
    parsed.username = ""
    parsed.password = ""
    parsed.search = ""
    parsed.hash = ""
    if (isRelative) return parsed.pathname
    if (parsed.origin !== "null") return `${parsed.origin}${parsed.pathname}`
    return `${parsed.protocol}${parsed.pathname}`
  } catch (_error) {
    return redactedValue
  }
}

function controlCharactersRemove(value: string): string {
  return value.replace(/\p{Cc}/gu, " ")
}
