import { createSignalObject } from "@adaptive-ds/solid-ui/utils/createSignalObject"
import { onCleanup, onMount } from "solid-js"
import * as v from "valibot"
import { healthResponseSchema } from "../api/health/healthResponseSchema.js"

type HealthState = "checking" | "connected" | "unavailable"

export function appStateCreate() {
  const health = createSignalObject<HealthState>("checking")
  const unavailableSince = createSignalObject<number | undefined>(undefined)

  onMount(() => {
    const controller = new AbortController()

    void (async () => {
      try {
        const response = await fetch("/api/health", { signal: controller.signal })
        const body: unknown = await response.json()
        const result = v.safeParse(healthResponseSchema, body)
        const next = response.ok && result.success ? "connected" : "unavailable"
        health.set(next)
        unavailableSince.set(next === "unavailable" ? Date.now() : undefined)
      } catch (_error) {
        if (!controller.signal.aborted) {
          health.set("unavailable")
          unavailableSince.set(Date.now())
        }
      }
    })()

    onCleanup(() => controller.abort())
  })

  return {
    healthStatus: health.get,
    healthDisconnectedSince: () => unavailableSince.get(),
    healthLabel: () => {
      if (health.get() === "connected") return "API connected"
      if (health.get() === "unavailable") return "API unavailable"
      return "Checking API"
    },
  }
}
