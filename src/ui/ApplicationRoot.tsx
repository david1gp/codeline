import type { JSX } from "solid-js"
import { App } from "./App.js"
import { CodelineZeroProvider } from "./CodelineZeroProvider.js"
import { appShellStateCreate } from "./appShellStateCreate.js"

export function ApplicationRoot(props: { children?: JSX.Element }) {
  return (
    <CodelineZeroProvider>
      <ApplicationRootContent>{props.children}</ApplicationRootContent>
    </CodelineZeroProvider>
  )
}

function ApplicationRootContent(props: { children?: JSX.Element }) {
  const state = appShellStateCreate()
  return <App state={state}>{props.children}</App>
}
