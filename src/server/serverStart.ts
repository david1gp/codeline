import { randomBytes } from "node:crypto"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import type { App } from "../api/appEnvironment.js"
import { appCreate } from "../app/appCreate.js"
import type { ConfigurationStore } from "../configuration/configurationStore.js"
import { configurationStoreCreate } from "../configuration/configurationStoreCreate.js"
import { projectRootConfigurationParse } from "../configuration/projectRootConfigurationParse.js"
import { runtimeConfigurationParse } from "../configuration/runtimeConfigurationParse.js"
import type { RuntimeConfiguration } from "../configuration/runtimeConfigurationSchema.js"
import type { DatabaseConnection } from "../database/databaseClient.js"
import { databaseConnectionClose } from "../database/databaseConnectionClose.js"
import { databaseCreate } from "../database/databaseCreate.js"
import { databaseUrl } from "../database/databaseUrl.js"
import { journalBacklogRead } from "../journal/actions/journalBacklogRead.js"
import type { JournalCursorCodec } from "../journal/actions/journalCursorCodecCreate.js"
import { journalCursorCodecCreate } from "../journal/actions/journalCursorCodecCreate.js"
import { journalPostCommitPublishCreate } from "../journal/actions/journalPostCommitPublishCreate.js"
import { metricsCollectorCreate } from "../metrics/metricsCollectorCreate.js"
import { providerAgentCatalogLoad } from "../providers/catalog/providerAgentCatalogLoad.js"
import type { ProviderCatalog } from "../providers/schema/providerCatalogSchema.js"
import { runActiveRegistryCreate } from "../run/actions/runActiveRegistryCreate.js"
import { runStartupInterruptionReconcile } from "../run/actions/runStartupInterruptionReconcile.js"
import { streamLiveSubscriptionCreate } from "../stream/actions/streamLiveSubscriptionCreate.js"
import { streamSseConnectionWriterCreate } from "../stream/actions/streamSseConnectionWriterCreate.js"
import { streamSseSchedulerCreate } from "../stream/actions/streamSseSchedulerCreate.js"
import { serverShutdownCoordinatorCreate } from "./serverShutdownCoordinatorCreate.js"

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

type ServerStartOptions = {
  appCreate?: (options: {
    configuration: RuntimeConfiguration
    configurationStore?: ConfigurationStore
    database: DatabaseConnection["db"]
    projectRootDirs: readonly string[]
    providerAgentCatalog?: ProviderCatalog
    journalCursorCodec: JournalCursorCodec
    journalBacklogRead: typeof journalBacklogRead
    journalPostCommitPublish: ReturnType<typeof journalPostCommitPublishCreate>
    streamLiveSubscription: ReturnType<typeof streamLiveSubscriptionCreate>
    streamSseConnectionWriterCreate: typeof streamSseConnectionWriterCreate
    streamSseNow: () => number
    streamSseScheduler: Parameters<typeof streamSseConnectionWriterCreate>[0]["scheduler"]
    shutdownCoordinator: ReturnType<typeof serverShutdownCoordinatorCreate>
    runActiveRegistry: ReturnType<typeof runActiveRegistryCreate>
    metricsCollector: ReturnType<typeof metricsCollectorCreate>
  }) => App
  configuration?: RuntimeConfiguration
  configurationStore?: ConfigurationStore
  database?: DatabaseConnection
  databaseConnectionClose?: typeof databaseConnectionClose
  projectRootDirs?: readonly string[]
  providerAgentCatalog?: ProviderCatalog
  journalCursorCodec?: JournalCursorCodec
  runActiveRegistry?: ReturnType<typeof runActiveRegistryCreate>
  runStartupInterruptionReconcile?: typeof runStartupInterruptionReconcile
  serve?: Serve
  serverShutdownCoordinator?: ReturnType<typeof serverShutdownCoordinatorCreate>
  signalSource?: SignalSource
  metricsCollector?: ReturnType<typeof metricsCollectorCreate>
}

export async function serverStart(options: ServerStartOptions = {}): Promise<Server> {
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
          databaseUrl,
          OPENCODE_DB_PATH: Bun.env.OPENCODE_DB_PATH,
          ...(Object.keys(developmentIdentity).length === 0 ? {} : { developmentIdentity }),
          nodeEnv: Bun.env.NODE_ENV ?? "development",
          AUTH_MODE: Bun.env.AUTH_MODE,
          OIDC_AUTHWORKS_ALLOWED_ORGANIZATION_ID: Bun.env.OIDC_AUTHWORKS_ALLOWED_ORGANIZATION_ID,
          OIDC_AUTHWORKS_CALLBACK_URL: Bun.env.OIDC_AUTHWORKS_CALLBACK_URL,
          OIDC_AUTHWORKS_CLIENT_ID: Bun.env.OIDC_AUTHWORKS_CLIENT_ID,
          OIDC_AUTHWORKS_CLIENT_SECRET: Bun.env.OIDC_AUTHWORKS_CLIENT_SECRET,
          OIDC_AUTHWORKS_ISSUER: Bun.env.OIDC_AUTHWORKS_ISSUER,
          OIDC_AUTHWORKS_ORGANIZATION_ID: Bun.env.OIDC_AUTHWORKS_ORGANIZATION_ID,
          OIDC_AUTHWORKS_REDIRECT_URI: Bun.env.OIDC_AUTHWORKS_REDIRECT_URI,
          OIDC_CALLBACK_URL: Bun.env.OIDC_CALLBACK_URL,
          OIDC_CLIENT_ID: Bun.env.OIDC_CLIENT_ID,
          OIDC_CLIENT_SECRET: Bun.env.OIDC_CLIENT_SECRET,
          OIDC_ISSUER: Bun.env.OIDC_ISSUER,
          OIDC_ORGANIZATION_ID: Bun.env.OIDC_ORGANIZATION_ID,
          OIDC_ALLOWED_ORGANIZATION_ID: Bun.env.OIDC_ALLOWED_ORGANIZATION_ID,
          OIDC_REDIRECT_URI: Bun.env.OIDC_REDIRECT_URI,
          OIDC_ZITADEL_ALLOWED_ORGANIZATION_ID: Bun.env.OIDC_ZITADEL_ALLOWED_ORGANIZATION_ID,
          OIDC_ZITADEL_CALLBACK_URL: Bun.env.OIDC_ZITADEL_CALLBACK_URL,
          OIDC_ZITADEL_CLIENT_ID: Bun.env.OIDC_ZITADEL_CLIENT_ID,
          OIDC_ZITADEL_CLIENT_SECRET: Bun.env.OIDC_ZITADEL_CLIENT_SECRET,
          OIDC_ZITADEL_ISSUER: Bun.env.OIDC_ZITADEL_ISSUER,
          OIDC_ZITADEL_ORGANIZATION_ID: Bun.env.OIDC_ZITADEL_ORGANIZATION_ID,
          OIDC_ZITADEL_REDIRECT_URI: Bun.env.OIDC_ZITADEL_REDIRECT_URI,
          PUBLIC_ORIGIN: Bun.env.PUBLIC_ORIGIN,
          SESSIONS_SIDEBAR_PAGE_SIZE: Bun.env.SESSIONS_SIDEBAR_PAGE_SIZE,
          ZITADEL_CLIENT_ID: Bun.env.ZITADEL_CLIENT_ID,
          ZITADEL_CLIENT_SECRET: Bun.env.ZITADEL_CLIENT_SECRET,
          ZITADEL_ISSUER: Bun.env.ZITADEL_ISSUER,
          ZITADEL_ORGANIZATION_ID: Bun.env.ZITADEL_ORGANIZATION_ID,
          ZITADEL_ALLOWED_ORGANIZATION_ID: Bun.env.ZITADEL_ALLOWED_ORGANIZATION_ID,
          ZITADEL_CALLBACK_URL: Bun.env.ZITADEL_CALLBACK_URL,
          ZITADEL_REDIRECT_URI: Bun.env.ZITADEL_REDIRECT_URI,
        })
      : { success: true as const, data: options.configuration }
  if (!configuration.success) throw new Error(configuration.errorMessage)

  const projectRootDirs = options.projectRootDirs ?? projectRootConfigurationRead()

  const configurationStore = await managedConfigurationStoreResolve(options.configurationStore, configuration.data)

  const providerAgentCatalogResult =
    options.providerAgentCatalog === undefined
      ? await providerAgentCatalogLoad(resolve(dirname(fileURLToPath(import.meta.url)), "../.."))
      : { success: true as const, data: options.providerAgentCatalog }
  if (!providerAgentCatalogResult.success) throw new Error(providerAgentCatalogResult.errorMessage)

  const database =
    options.database === undefined
      ? databaseCreate(configuration.data)
      : { success: true as const, data: options.database }
  if (!database.success) throw new Error(database.errorMessage)

  const port = Number(Bun.env.PORT ?? 6001)
  const hostname = Bun.env.HOST ?? "127.0.0.1"
  const createApp = options.appCreate ?? appCreate
  const journalCursorCodec = options.journalCursorCodec ?? serverJournalCursorCodecCreate()
  const streamLiveSubscription = streamLiveSubscriptionCreate()
  const streamSseScheduler = streamSseSchedulerCreate()
  const journalPostCommitPublish = journalPostCommitPublishCreate({
    cursorCodec: journalCursorCodec,
    liveSubscription: streamLiveSubscription,
  })
  const metricsCollector = options.metricsCollector ?? metricsCollectorCreate()
  const shutdownCoordinator = options.serverShutdownCoordinator ?? serverShutdownCoordinatorCreate()
  const runActiveRegistry = options.runActiveRegistry ?? runActiveRegistryCreate()
  const application = createApp({
    configuration: configuration.data,
    configurationStore,
    database: database.data.db,
    projectRootDirs,
    providerAgentCatalog: providerAgentCatalogResult.data,
    journalCursorCodec,
    journalBacklogRead,
    journalPostCommitPublish,
    streamLiveSubscription,
    streamSseConnectionWriterCreate,
    streamSseNow: Date.now,
    streamSseScheduler,
    shutdownCoordinator,
    runActiveRegistry,
    metricsCollector,
  })
  const reconciled = await (options.runStartupInterruptionReconcile ?? runStartupInterruptionReconcile)({
    database: database.data.db,
    postCommitPublish: journalPostCommitPublish,
    runActiveRegistry,
  })
  if (!reconciled.success) throw new Error(reconciled.errorMessage)
  const server = (options.serve ?? (Bun.serve as Serve))({
    fetch: application.fetch,
    hostname,
    idleTimeout: 0,
    port,
  })

  const signalSource = options.signalSource ?? process
  let shutdownPromise: Promise<void> | undefined
  const shutdown = () => {
    if (shutdownPromise !== undefined) return shutdownPromise
    shutdownPromise = (async () => {
      try {
        const result = await shutdownCoordinator.shutdown(async () => {
          const cleanupErrors: unknown[] = []
          try {
            await server.stop(true)
          } catch (error: unknown) {
            cleanupErrors.push(error)
          }

          try {
            const closed = await (options.databaseConnectionClose ?? databaseConnectionClose)(database.data)
            if (!closed.success) cleanupErrors.push(new Error(closed.errorMessage))
          } catch (error: unknown) {
            cleanupErrors.push(error)
          }

          if (cleanupErrors.length === 1) throw cleanupErrors[0]
          if (cleanupErrors.length > 1) throw new AggregateError(cleanupErrors, "Server cleanup failed.")
        })
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

function serverJournalCursorCodecCreate(): JournalCursorCodec {
  const secret = Bun.env.SESSION_SECRET
  if (secret === undefined || secret.length === 0) throw new Error("SESSION_SECRET is required for session routes.")
  const result = journalCursorCodecCreate({ randomBytes, secret })
  if (!result.success) throw new Error(result.errorMessage)
  return result.data
}

function projectRootConfigurationRead(): readonly string[] {
  const result = projectRootConfigurationParse(Bun.env.CODELINE_PROJECT_ROOTS)
  if (!result.success) throw new Error(result.errorMessage)
  return result.data
}

async function managedConfigurationStoreResolve(
  injectedStore: ConfigurationStore | undefined,
  configuration: RuntimeConfiguration,
): Promise<ConfigurationStore> {
  if (injectedStore !== undefined) return injectedStore

  const dir = Bun.env.CONFIG_STORE_DIR
  if (dir === undefined) throw new Error("CONFIG_STORE_DIR is required.")

  const identity = configuration.developmentIdentity
  const store = await configurationStoreCreate({
    authorEmail: Bun.env.CONFIG_STORE_AUTHOR_EMAIL ?? identity?.email ?? "codeline@example.test",
    authorName: Bun.env.CONFIG_STORE_AUTHOR_NAME ?? identity?.displayName ?? "Codeline",
    branch: Bun.env.CONFIG_STORE_BRANCH ?? "main",
    dir,
  })
  if (!store.success) throw new Error(store.errorMessage)
  return store.data
}
