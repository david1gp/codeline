import type { CodelineConfigurationDocument } from "./codelineConfigurationDocumentSchema.js"
import type { ConfigurationRevision } from "./configurationRevisionSchema.js"

type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly (infer Item)[]
    ? readonly DeepReadonly<Item>[]
    : T extends object
      ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
      : T

export type ConfigurationStoreSnapshot = {
  readonly configuration: DeepReadonly<CodelineConfigurationDocument>
  readonly revision: ConfigurationRevision
}
