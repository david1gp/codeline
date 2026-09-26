import type { GitStore } from "@adaptive-ds/git-store"
import type { ConfigurationStoreSnapshot } from "./configurationStoreSnapshot.js"

export type ConfigurationStore = {
  readonly gitStore: Readonly<GitStore>
  snapshot: ConfigurationStoreSnapshot | undefined
}
