import { randomBytes } from "node:crypto"
import { dirname, isAbsolute, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import { appCreate } from "../app/appCreate.js"
import type { ConfigurationStore } from "../configuration/configurationStore.js"
import { configurationStoreCreate } from "../configuration/configurationStoreCreate.js"
import { localRuntimeConfigurationSchema } from "../configuration/localRuntimeConfigurationSchema.js"
import { projectRootConfigurationParse } from "../configuration/projectRootConfigurationParse.js"
import { projectRootConfigurationSchema } from "../configuration/projectRootConfigurationSchema.js"
import { runtimeConfigurationParse } from "../configuration/runtimeConfigurationParse.js"
import type { RuntimeConfiguration } from "../configuration/runtimeConfigurationSchema.js"
import { databaseConnectionClose } from "../database/databaseConnectionClose.js"
import { databaseCreate } from "../database/databaseCreate.js"
import { databaseFilePathResolve } from "../database/databaseFilePathResolve.js"
import { databaseUrl } from "../database/databaseUrl.js"
import { localIdentityPolicySchema } from "../identity/localIdentityPolicySchema.js"
import { journalCursorCodecCreate } from "../journal/actions/journalCursorCodecCreate.js"
import { journalEventsPruneSchedulerCreate } from "../journal/actions/journalEventsPruneSchedulerCreate.js"
import { journalGlobalSummaryBacklogRead } from "../journal/actions/journalGlobalSummaryBacklogRead.js"
import { journalGlobalSummaryPostCommitPublishCreate } from "../journal/actions/journalGlobalSummaryPostCommitPublishCreate.js"
import { journalPostCommitPublishCreate } from "../journal/actions/journalPostCommitPublishCreate.js"
import { metricsCollectorCreate } from "../metrics/metricsCollectorCreate.js"
import { providerAgentCatalogLoad } from "../providers/catalog/providerAgentCatalogLoad.js"
import { runActiveRegistryCreate } from "../run/actions/runActiveRegistryCreate.js"
import { runStartupInterruptionReconcile } from "../run/actions/runStartupInterruptionReconcile.js"
import { sessionDetailPostCommitPublishCreate } from "../session/actions/sessionDetailPostCommitPublishCreate.js"
import { sessionDetailStreamBacklogRead } from "../session/actions/sessionDetailStreamBacklogRead.js"
import { streamLiveSubscriptionCreate } from "../stream/actions/streamLiveSubscriptionCreate.js"
import { streamSseConnectionWriterCreate } from "../stream/actions/streamSseConnectionWriterCreate.js"
import { streamSseSchedulerCreate } from "../stream/actions/streamSseSchedulerCreate.js"
import type { ServerRuntimeOptions } from "./serverRuntimeOptions.js"
import { serverShutdownCoordinatorCreate } from "./serverShutdownCoordinatorCreate.js"

export async function serverRuntimeCreate(options: ServerRuntimeOptions = {}) {
  const op = "serverRuntimeCreate"
  if (options.local !== undefined && options.configuration !== undefined)
    return createResultError(op, "Local and network runtime configuration cannot be combined.")
  if (options.local !== undefined) {
    if (options.configurationStore === undefined || options.journalCursorCodec === undefined)
      return createResultError(
        op,
        "Local composition requires an injected configuration store and journal cursor codec.",
      )
    const localRoots = v.safeParse(projectRootConfigurationSchema, options.projectRootDirs)
    if (!localRoots.success || localRoots.output.some((root) => !isAbsolute(root)))
      return createResultError(op, "Local composition requires explicit absolute project roots.")
  }
  if (options.database !== undefined && options.databasePath !== undefined)
    return createResultError(op, "Inject either a database connection or an absolute database path, not both.")
  const localConfiguration =
    options.local === undefined ? undefined : v.safeParse(localRuntimeConfigurationSchema, options.local.configuration)
  if (localConfiguration !== undefined && !localConfiguration.success)
    return createResultError(op, `Local runtime configuration is invalid. ${v.summarize(localConfiguration.issues)}`)
  const localIdentity =
    options.local === undefined ? undefined : v.safeParse(localIdentityPolicySchema, options.local.identity)
  if (localIdentity !== undefined && !localIdentity.success)
    return createResultError(op, `Local identity policy is invalid. ${v.summarize(localIdentity.issues)}`)
  const injectedDatabasePath = options.databasePath ?? localConfiguration?.output?.databaseUrl
  const resolvedDatabasePath =
    injectedDatabasePath === undefined ? undefined : databaseFilePathResolve(injectedDatabasePath)
  if (resolvedDatabasePath !== undefined && !resolvedDatabasePath.success) return resolvedDatabasePath
  if (localConfiguration?.success && options.databasePath !== undefined) {
    const configuredPath = databaseFilePathResolve(localConfiguration.output.databaseUrl)
    if (!configuredPath.success) return configuredPath
    if (configuredPath.data !== resolvedDatabasePath?.data)
      return createResultError(op, "Local configuration and injected database paths must match.")
  }
  const developmentIdentity = {
    ...(Bun.env.DEVELOPMENT_IDENTITY_EMAIL === undefined ? {} : { email: Bun.env.DEVELOPMENT_IDENTITY_EMAIL }),
    ...(Bun.env.DEVELOPMENT_IDENTITY_KEY === undefined ? {} : { identityKey: Bun.env.DEVELOPMENT_IDENTITY_KEY }),
    ...(Bun.env.DEVELOPMENT_IDENTITY_DISPLAY_NAME === undefined
      ? {}
      : { displayName: Bun.env.DEVELOPMENT_IDENTITY_DISPLAY_NAME }),
  }
  const configuration: Result<RuntimeConfiguration> = localConfiguration?.success
    ? createResult(localConfiguration.output)
    : options.configuration === undefined
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
      : createResult(options.configuration)
  if (!configuration.success) return configuration

  const projectRootDirs =
    options.projectRootDirs === undefined
      ? projectRootConfigurationParse(Bun.env.CODELINE_PROJECT_ROOTS)
      : createResult(options.projectRootDirs)
  if (!projectRootDirs.success) return projectRootDirs

  const configurationStore = await managedConfigurationStoreResolve(options.configurationStore, configuration.data)
  if (!configurationStore.success) return configurationStore

  const providerAgentCatalog =
    options.providerAgentCatalog === undefined
      ? await providerAgentCatalogLoad(resolve(dirname(fileURLToPath(import.meta.url)), "../.."))
      : createResult(options.providerAgentCatalog)
  if (!providerAgentCatalog.success) return providerAgentCatalog

  const journalCursorCodec =
    options.journalCursorCodec === undefined
      ? serverJournalCursorCodecCreate()
      : createResult(options.journalCursorCodec)
  if (!journalCursorCodec.success) return journalCursorCodec

  const database =
    options.database === undefined
      ? databaseCreate(configuration.data, resolvedDatabasePath?.data)
      : createResult(options.database)
  if (!database.success) return database

  const streamLiveSubscription = streamLiveSubscriptionCreate()
  const streamSseScheduler = streamSseSchedulerCreate()
  const metricsCollector = options.metricsCollector ?? metricsCollectorCreate()
  const journalEventsPruneScheduler =
    options.journalEventsPruneScheduler ??
    journalEventsPruneSchedulerCreate({
      database: database.data.db,
      metricsCollector,
    })
  const journalGlobalSummaryPostCommitPublish = journalGlobalSummaryPostCommitPublishCreate({
    cursorCodec: journalCursorCodec.data,
    liveSubscription: streamLiveSubscription,
  })
  const sessionDetailPostCommitPublish = sessionDetailPostCommitPublishCreate({
    cursorCodec: journalCursorCodec.data,
    database: database.data.db,
    liveSubscription: streamLiveSubscription,
  })
  const journalPostCommitPublish = journalPostCommitPublishCreate({
    globalSummaryPostCommitPublish: journalGlobalSummaryPostCommitPublish,
    pruneScheduler: journalEventsPruneScheduler,
    selectedSessionDetailPostCommitPublish: sessionDetailPostCommitPublish,
  })
  const shutdownCoordinator = options.serverShutdownCoordinator ?? serverShutdownCoordinatorCreate()
  const runActiveRegistry = options.runActiveRegistry ?? runActiveRegistryCreate()

  const shutdownPerform = async (beforeCleanup?: () => Promise<void> | void) => {
    const result = await shutdownCoordinator.shutdown(async () => {
      const cleanupErrors: unknown[] = []
      try {
        await beforeCleanup?.()
      } catch (error: unknown) {
        cleanupErrors.push(error)
      }

      try {
        await journalEventsPruneScheduler.drain()
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
    if (!result.success)
      return {
        ...createResultError("serverRuntimeShutdown", "Server shutdown failed."),
        diagnostics: result.diagnostics,
      }
    return createResult(undefined)
  }
  let shutdownPromise: ReturnType<typeof shutdownPerform> | undefined
  // A serving wrapper can stop its listener inside the same deadline, before runtime cleanup.
  const shutdown = (beforeCleanup?: () => Promise<void> | void) => {
    if (shutdownPromise !== undefined) return shutdownPromise
    shutdownPromise = shutdownPerform(beforeCleanup)
    return shutdownPromise
  }

  const dependencies = {
    configuration: configuration.data,
    localIdentity: localIdentity?.output,
    configurationStore: configurationStore.data,
    database: database.data.db,
    fixtureApiToken: options.local === undefined ? Bun.env.E2E_FIXTURE_API_TOKEN : undefined,
    projectRootDirs: projectRootDirs.data,
    providerAgentCatalog: providerAgentCatalog.data,
    providerEnvironment: options.providerEnvironment,
    journalCursorCodec: journalCursorCodec.data,
    journalGlobalSummaryBacklogRead,
    journalPostCommitPublish,
    sessionDetailStreamBacklogRead,
    globalSummaryLiveSubscription: streamLiveSubscription,
    streamLiveSubscription,
    streamSseConnectionWriterCreate,
    streamSseNow: Date.now,
    streamSseScheduler,
    shutdownCoordinator,
    runActiveRegistry,
    metricsCollector,
  }
  const application = (options.appCreate ?? appCreate)(dependencies)
  const reconciled = await (options.runStartupInterruptionReconcile ?? runStartupInterruptionReconcile)({
    database: database.data.db,
    postCommitPublish: journalPostCommitPublish,
    runActiveRegistry,
  })
  if (!reconciled.success) {
    const closed = await shutdown()
    if (!closed.success)
      return createResultError(op, reconciled.errorMessage, `${reconciled.errorMessage}; ${closed.errorMessage}`)
    return reconciled
  }
  return createResult({ application, dependencies, shutdown })
}

function serverJournalCursorCodecCreate() {
  const secret = Bun.env.SESSION_SECRET
  if (secret === undefined || secret.length === 0)
    return createResultError("serverJournalCursorCodecCreate", "SESSION_SECRET is required for session routes.")
  return journalCursorCodecCreate({ randomBytes, secret })
}

async function managedConfigurationStoreResolve(
  injectedStore: ConfigurationStore | undefined,
  configuration: RuntimeConfiguration,
) {
  if (injectedStore !== undefined) return createResult(injectedStore)

  const dir = Bun.env.CONFIG_STORE_DIR
  if (dir === undefined) return createResultError("managedConfigurationStoreResolve", "CONFIG_STORE_DIR is required.")

  const identity = configuration.developmentIdentity
  return configurationStoreCreate({
    authorEmail: Bun.env.CONFIG_STORE_AUTHOR_EMAIL ?? identity?.email ?? "codeline@example.test",
    authorName: Bun.env.CONFIG_STORE_AUTHOR_NAME ?? identity?.displayName ?? "Codeline",
    branch: Bun.env.CONFIG_STORE_BRANCH ?? "main",
    dir,
  })
}
