import { expect, test } from "bun:test"
import { pwaShellRequestCacheable } from "../src/ui/pwa/pwaShellRequestCacheable.js"

const origin = "https://codeline.work"

test.each([
  ["GET", "https://codeline.work/assets/app.js", true],
  ["GET", "https://codeline.work/logo/codeline-icon-192.png", true],
  ["GET", "https://codeline.work/manifest.webmanifest", true],
  ["GET", "https://codeline.work/favicon.ico", true],
  ["GET", "https://codeline.work/api/health", false],
  ["GET", "https://codeline.work/api/events", false],
  ["GET", "https://codeline.work/api/events?after=opaque-cursor", false],
  ["GET", "https://codeline.work/api/sessions/1/chat", false],
  ["GET", "https://codeline.work/api/auth/session", false],
  ["GET", "https://codeline.work/api/auth/login", false],
  ["GET", "https://codeline.work/api/auth/callback", false],
  ["POST", "https://codeline.work/api/auth/logout", false],
  ["PATCH", "https://codeline.work/api/sessions/1", false],
  ["DELETE", "https://codeline.work/api/sessions/1", false],
  ["GET", "https://codeline.work/login", false],
  ["GET", "https://codeline.work/health", false],
  ["GET", "https://codeline.work/ready", false],
  ["GET", "https://codeline.work/service-worker.js", false],
  ["GET", "https://codeline.work/assets/../api/health", false],
  ["GET", "https://codeline.work/?session=abc", false],
  ["GET", "https://codeline.work/assets/app.js?v=2", false],
  ["GET", "https://other.example/assets/app.js", false],
  ["POST", "https://codeline.work/assets/app.js", false],
])("%s %s cacheable: %s", (method, url, expected) => {
  expect(pwaShellRequestCacheable({ method, url }, origin)).toBe(expected)
})
