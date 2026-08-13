import type { JSX } from "solid-js"
import { App } from "./App.js"
import { CodelineZeroProvider } from "./CodelineZeroProvider.js"

export function ApplicationRoot(props: { children?: JSX.Element }) {
  return (
    <CodelineZeroProvider>
      <App>{props.children}</App>
    </CodelineZeroProvider>
  )
}
