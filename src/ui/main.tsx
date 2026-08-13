import { render } from "solid-js/web"
import { App } from "./App.js"
import { CodelineZeroProvider } from "./CodelineZeroProvider.js"
import { DemoApp } from "./demo/DemoApp.js"
import { demoScenarioResolve } from "./demo/demoScenarioResolve.js"
import "./styles.css"

const root = document.getElementById("app")

if (!root) {
  throw new Error("Missing application root")
}

if (window.location.pathname === "/demo" || window.location.pathname.startsWith("/demo/")) {
  render(() => <DemoApp scenario={demoScenarioResolve(window.location.pathname)} />, root)
} else {
  render(
    () => (
      <CodelineZeroProvider>
        <App />
      </CodelineZeroProvider>
    ),
    root,
  )
}
