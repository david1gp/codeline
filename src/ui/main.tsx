import { render } from "solid-js/web"
import { App } from "./App.js"
import { CodelineZeroProvider } from "./CodelineZeroProvider.js"
import "./styles.css"

const root = document.getElementById("app")

if (!root) {
  throw new Error("Missing application root")
}

render(
  () => (
    <CodelineZeroProvider>
      <App />
    </CodelineZeroProvider>
  ),
  root,
)
