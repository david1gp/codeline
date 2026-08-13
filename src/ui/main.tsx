import { render } from "solid-js/web"
import { UiRouter } from "./UiRouter.js"
import "./styles.css"

const root = document.getElementById("app")

if (!root) {
  throw new Error("Missing application root")
}

render(() => <UiRouter />, root)
