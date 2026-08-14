import type { ZeroConnectionStatus } from "./zeroConnectionStatusResolve.js"

/**
 * Rendering contract of the Zero connection indicator, so the Zero provider and
 * demo fixtures can supply the same shape without the view knowing the source.
 */
export type ZeroConnectionView = {
  disconnectedSince: () => number | undefined
  label: () => string
  status: () => ZeroConnectionStatus
}
