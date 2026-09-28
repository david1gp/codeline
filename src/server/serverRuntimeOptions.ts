import type { appCreate } from "../app/appCreate.js"
import type { ConfigurationStore } from "../configuration/configurationStore.js"
import type { LocalRuntimeConfiguration } from "../configuration/localRuntimeConfigurationSchema.js"
import type { RuntimeConfiguration } from "../configuration/runtimeConfigurationSchema.js"
import type { DatabaseConnection } from "../database/databaseClient.js"
import type { databaseConnectionClose } from "../database/databaseConnectionClose.js"
import type { LocalIdentityPolicy } from "../identity/localIdentityPolicySchema.js"
import type { JournalCursorCodec } from "../journal/actions/journalCursorCodecCreate.js"
import type { journalEventsPruneSchedulerCreate } from "../journal/actions/journalEventsPruneSchedulerCreate.js"
import type { metricsCollectorCreate } from "../metrics/metricsCollectorCreate.js"
import type { ProviderCatalog } from "../providers/schema/providerCatalogSchema.js"
import type { runActiveRegistryCreate } from "../run/actions/runActiveRegistryCreate.js"
import type { runStartupInterruptionReconcile } from "../run/actions/runStartupInterruptionReconcile.js"
import type { serverShutdownCoordinatorCreate } from "./serverShutdownCoordinatorCreate.js"

export type ServerRuntimeOptions = {
  appCreate?: (options: NonNullable<Parameters<typeof appCreate>[0]>) => ReturnType<typeof appCreate>
  configuration?: RuntimeConfiguration
  // Mutually exclusive with network configuration; only for no-listener composition.
  local?: { configuration: LocalRuntimeConfiguration; identity: LocalIdentityPolicy }
  configurationStore?: ConfigurationStore
  database?: DatabaseConnection
  // Explicit absolute path or file URL. Default preview path remains unchanged.
  databasePath?: string
  databaseConnectionClose?: typeof databaseConnectionClose
  projectRootDirs?: readonly string[]
  providerAgentCatalog?: ProviderCatalog
  providerEnvironment?: Readonly<Record<string, string | undefined>>
  journalCursorCodec?: JournalCursorCodec
  journalEventsPruneScheduler?: ReturnType<typeof journalEventsPruneSchedulerCreate>
  runActiveRegistry?: ReturnType<typeof runActiveRegistryCreate>
  runStartupInterruptionReconcile?: typeof runStartupInterruptionReconcile
  serverShutdownCoordinator?: ReturnType<typeof serverShutdownCoordinatorCreate>
  metricsCollector?: ReturnType<typeof metricsCollectorCreate>
}
