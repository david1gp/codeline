import { appCreate } from "../app/appCreate.js"
import type { App } from "../api/appEnvironment.js"
import { runtimeConfigurationParse } from "../configuration/runtimeConfigurationParse.js"
import type { RuntimeConfiguration } from "../configuration/runtimeConfigurationSchema.js"
import { databaseConnectionClose } from "../database/databaseConnectionClose.js"
import { databaseCreate } from "../database/databaseCreate.js"
import type { DatabaseConnection } from "../database/databaseClient.js"

type Server = {
  stop: (closeActiveConnections?: boolean) => Promise<void>
  url: URL
}

type Serve = (options: {
  fetch: (request: Request) => Response | Promise<Response>
  hostname: string
  port: number
}) => Server

type SignalSource = {
  once: (signal: "SIGINT" | "SIGTERM", listener: () => void) => unknown
  removeListener: (signal: "SIGINT" | "SIGTERM", listener: () => void) => unknown
}

type ServerStartOptions = {
  appCreate?: (options: { configuration: RuntimeConfiguration; database: DatabaseConnection["db"] }) => App
  configuration?: RuntimeConfiguration
  database?: DatabaseConnection
  serve?: Serve
  signalSource?: SignalSource
}

export function serverStart(options: ServerStartOptions = {}): Server {
  const developmentIdentity = {
    ...(Bun.env.DEVELOPMENT_IDENTITY_EMAIL === undefined ? {} : { email: Bun.env.DEVELOPMENT_IDENTITY_EMAIL }),
    ...(Bun.env.DEVELOPMENT_IDENTITY_KEY === undefined ? {} : { identityKey: Bun.env.DEVELOPMENT_IDENTITY_KEY }),
    ...(Bun.env.DEVELOPMENT_IDENTITY_DISPLAY_NAME === undefined
      ? {}
      : { displayName: Bun.env.DEVELOPMENT_IDENTITY_DISPLAY_NAME }),
  }
  const configuration =
    options.configuration === undefined
      ? runtimeConfigurationParse({
          databaseUrl: Bun.env.DATABASE_URL,
          ...(Object.keys(developmentIdentity).length === 0 ? {} : { developmentIdentity }),
          nodeEnv: Bun.env.NODE_ENV ?? "development",
        })
      : { success: true as const, data: options.configuration }
  if (!configuration.success) throw new Error(configuration.errorMessage)

  const database =
    options.database === undefined
      ? databaseCreate(configuration.data)
      : { success: true as const, data: options.database }
  if (!database.success) throw new Error(database.errorMessage)

  const port = Number(Bun.env.PORT ?? 6001)
  const hostname = Bun.env.HOST ?? "127.0.0.1"
  const createApp = options.appCreate ?? appCreate
  const server = (options.serve ?? (Bun.serve as Serve))({
    fetch: createApp({ configuration: configuration.data, database: database.data.db }).fetch,
    hostname,
    port,
  })

  const signalSource = options.signalSource ?? process
  let shutdownPromise: Promise<void> | undefined
  const shutdown = async () => {
    if (shutdownPromise !== undefined) return shutdownPromise
    shutdownPromise = (async () => {
      try {
        await server.stop(true)
      } finally {
        await databaseConnectionClose(database.data)
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
