import { render } from "solid-js/web"
import { browserDiagnosticsInstall } from "./diagnostics/browserDiagnosticsInstall.js"
import { UiRouter } from "./UiRouter.js"
import "./styles.css"

browserDiagnosticsInstall()

const root = document.getElementById("app")

if (!root) {
  throw new Error("Missing application root")
}

render(() => <UiRouter />, root)
