import type { Accessor } from "solid-js"

export type SessionProjectPathOverride = {
  get: Accessor<string | null>
  set: (value: string | null) => void
}
