import type { UiDataLayerStatus } from "./uiDataLayerStatusSchema.js"

/**
 * Rendering contract of the event-feed connection indicator, so the shell
 * data-layer feed owner and demo fixtures can supply the same shape without the
 * view knowing the source.
 */
export type EventFeedConnectionView = {
  disconnectedSince: () => number | undefined
  label: () => string
  status: () => UiDataLayerStatus["status"]
}
