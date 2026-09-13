import type { Accessor } from "solid-js"

export type SessionProjectIdOverride = {
  get: Accessor<string | null>
  set: (value: string | null) => void
}
