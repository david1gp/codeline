import { ZeroProvider } from "@rocicorp/zero/solid"
import type { JSX } from "solid-js"
import { zeroSchema } from "../database/zeroSchema.js"
import { noteMutators } from "../note/noteMutators.js"
import { zeroMaterializationDiagnosticsStart } from "./zeroMaterializationDiagnosticsStart.js"

export function CodelineZeroProvider(props: { children: JSX.Element; userId: string }) {
  return (
    <ZeroProvider
      cacheURL={import.meta.env.VITE_ZERO_CACHE_URL ?? window.location.origin}
      context={{ userId: props.userId }}
      mutateURL={import.meta.env.VITE_ZERO_MUTATE_URL ?? `${window.location.origin}/api/mutate`}
      mutators={noteMutators}
      queryURL={import.meta.env.VITE_ZERO_QUERY_URL ?? `${window.location.origin}/api/query`}
      schema={zeroSchema}
      userID={props.userId}
      init={zeroMaterializationDiagnosticsStart}
    >
      {props.children}
    </ZeroProvider>
  )
}
