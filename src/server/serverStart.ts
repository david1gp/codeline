import { serverRuntimeCreate } from "./serverRuntimeCreate.js"
import type { ServerRuntimeOptions } from "./serverRuntimeOptions.js"

type Server = {
  stop: (closeActiveConnections?: boolean) => Promise<void>
  url: URL
}

type Serve = (options: {
  fetch: (request: Request) => Response | Promise<Response>
  hostname: string
  idleTimeout: number
  port: number
}) => Server

type SignalSource = {
  once: (signal: "SIGINT" | "SIGTERM", listener: () => void) => unknown
  removeListener: (signal: "SIGINT" | "SIGTERM", listener: () => void) => unknown
}

type ServerStartOptions = Omit<ServerRuntimeOptions, "local"> & {
  local?: never
  serve?: Serve
  signalSource?: SignalSource
}

export async function serverStart(options: ServerStartOptions = {}): Promise<Server> {
  // Also reject untyped callers: a fixed local identity must never be network-served.
  if (options.local !== undefined) throw new Error("Local runtime composition cannot open a network listener.")
  const runtime = await serverRuntimeCreate(options)
  if (!runtime.success) throw new Error(runtime.errorMessage)

  const server = (options.serve ?? (Bun.serve as Serve))({
    fetch: runtime.data.application.fetch,
    hostname: Bun.env.HOST ?? "127.0.0.1",
    idleTimeout: 0,
    port: Number(Bun.env.PORT ?? 6001),
  })

  const signalSource = options.signalSource ?? process
  let shutdownPromise: Promise<void> | undefined
  const shutdown = () => {
    if (shutdownPromise !== undefined) return shutdownPromise
    shutdownPromise = (async () => {
      try {
        const result = await runtime.data.shutdown(() => server.stop(true))
        if (!result.success) {
          const errors = result.diagnostics.errors.map(({ error }) => error)
          if (errors.length === 1) throw errors[0]
          throw new AggregateError(errors, "Server shutdown failed.")
        }
      } finally {
        signalSource.removeListener("SIGINT", shutdown)
        signalSource.removeListener("SIGTERM", shutdown)
      }
    })()
    return shutdownPromise
  }
  signalSource.once("SIGINT", shutdown)
  signalSource.once("SIGTERM", shutdown)

  console.log(`Codeline API listening at ${server.url}`)
  return server
}
