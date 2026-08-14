import type { BadgeVariant } from "@adaptive-ds/solid-ui/static/badge/badgeCva"
import type { PwaBrowserStatus } from "./pwaBrowserStatusResolve.js"

/**
 * Rendering contract of the PWA status indicator, so browser APIs and demo
 * fixtures can supply the same shape without the view knowing the source.
 */
export type PwaStatusView = {
  disconnectedSince: () => number | undefined
  install: () => Promise<void>
  installable: () => boolean
  label: () => string
  reloadForUpdate: () => void
  status: () => PwaBrowserStatus
}
