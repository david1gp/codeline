import { badgeVariant } from "@adaptive-ds/solid-ui/static/badge/badgeCva"
import { createSignalObject } from "@adaptive-ds/solid-ui/utils/createSignalObject"
import { onCleanup, onMount } from "solid-js"
import * as v from "valibot"
import { healthResponseSchema } from "../api/health/healthResponseSchema.js"

type HealthState = "checking" | "connected" | "unavailable"

export function appStateCreate() {
  const health = createSignalObject<HealthState>("checking")

  onMount(() => {
    const controller = new AbortController()

    void (async () => {
      try {
        const response = await fetch("/api/health", { signal: controller.signal })
        const body: unknown = await response.json()
        const result = v.safeParse(healthResponseSchema, body)
        health.set(response.ok && result.success ? "connected" : "unavailable")
      } catch (error) {
        if (!controller.signal.aborted) {
          health.set("unavailable")
        }
      }
    })()

    onCleanup(() => controller.abort())
  })

  return {
    healthStatus: health.get,
    healthLabel: () => {
      if (health.get() === "connected") return "API connected"
      if (health.get() === "unavailable") return "API unavailable"
      return "Checking API"
    },
    healthVariant: () => (health.get() === "connected" ? badgeVariant.filledGreen : badgeVariant.subtle),
  }
}
