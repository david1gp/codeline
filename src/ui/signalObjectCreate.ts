import { createSignal } from "solid-js/dist/solid.js"

export function signalObjectCreate<T>(value: T) {
  const [get, set] = createSignal(value)
  return { get, set }
}
