import { expect, test } from "bun:test"
import { apiDiagnosticsLimits } from "../src/api/diagnostics/apiDiagnosticsLimits.js"
import { browserDiagnosticsEventSanitize } from "../src/ui/diagnostics/browserDiagnosticsEventSanitize.js"

test("browserDiagnosticsEventSanitize bounds and cleans log event fields", () => {
  const sanitized = browserDiagnosticsEventSanitize({
    data: {
      authorization: "Bearer secret-token",
      nested: { token: "private-token", value: 123 },
    },
    level: "error",
    message: "Failed fetch at https://example.com/api/test?secret=123#frag with Bearer auth-token-here",
    source: "  console.error  ",
    stack: "Error: failure\n    at https://example.com/app.js?v=1#line:10:5",
    timestamp: 1724716800000,
    url: "https://codeline.test/sessions/new?query=confidential#panel",
  })

  expect(sanitized.level).toBe("error")
  expect(sanitized.message).not.toContain("secret=123")
  expect(sanitized.message).not.toContain("auth-token-here")
  expect(sanitized.message).not.toContain("#frag")
  expect(sanitized.message).toContain("https://example.com/api/test")
  expect(sanitized.source).toBe("console.error")
  expect(sanitized.stack).not.toContain("?v=1")
  expect(sanitized.timestamp).toBe(1724716800000)
  expect(sanitized.url).toBe("https://codeline.test/sessions/new")

  const dataString = JSON.stringify(sanitized.data)
  expect(dataString).not.toContain("secret-token")
  expect(dataString).not.toContain("private-token")
  expect(dataString).toContain("[REDACTED]")
})

test("browserDiagnosticsEventSanitize truncates oversized fields according to limits", () => {
  const longString = "a".repeat(apiDiagnosticsLimits.maxMessageLength + 500)
  const longStack = "s".repeat(apiDiagnosticsLimits.maxStackLength + 500)
  const longSource = "src".repeat(100)

  const sanitized = browserDiagnosticsEventSanitize({
    level: "warn",
    message: longString,
    source: longSource,
    stack: longStack,
  })

  expect(sanitized.level).toBe("warn")
  expect(sanitized.message.length).toBeLessThanOrEqual(apiDiagnosticsLimits.maxMessageLength)
  expect(sanitized.source?.length).toBeLessThanOrEqual(apiDiagnosticsLimits.maxSourceLength)
  expect(sanitized.stack?.length).toBeLessThanOrEqual(apiDiagnosticsLimits.maxStackLength)
})

test("browserDiagnosticsEventSanitize falls back to safe defaults for invalid or empty inputs", () => {
  const sanitized = browserDiagnosticsEventSanitize({
    level: "invalid-level" as never,
    message: "   ",
  })

  expect(sanitized.level).toBe("error")
  expect(sanitized.message).toBe("Unknown diagnostic event")
})
