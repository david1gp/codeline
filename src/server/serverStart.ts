import { appCreate } from "../app/appCreate.js"

export function serverStart() {
  const port = Number(Bun.env.PORT ?? 3000)
  const hostname = Bun.env.HOST ?? "127.0.0.1"
  const server = Bun.serve({
    fetch: appCreate().fetch,
    hostname,
    port,
  })

  console.log(`Codeline API listening at ${server.url}`)
  return server
}
