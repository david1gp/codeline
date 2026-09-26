import { serverStart } from "./server/serverStart.js"

if (import.meta.main) {
  await serverStart()
}
