import { ZeroProvider } from "@rocicorp/zero/solid"
import type { JSX } from "solid-js"
import { zeroSchema } from "../database/zeroSchema.js"
import { noteMutators } from "../note/noteMutators.js"

const localDevelopmentIdentity = "local-development"
const localDevelopmentUserId = "development:local-development"

export function CodelineZeroProvider(props: { children: JSX.Element }) {
  return (
    <ZeroProvider
      cacheURL={import.meta.env.VITE_ZERO_CACHE_URL ?? window.location.origin}
      context={{ userId: localDevelopmentUserId }}
      mutateURL={import.meta.env.VITE_ZERO_MUTATE_URL ?? `${window.location.origin}/api/mutate`}
      mutators={noteMutators}
      queryURL={import.meta.env.VITE_ZERO_QUERY_URL ?? `${window.location.origin}/api/query`}
      schema={zeroSchema}
      userID={localDevelopmentIdentity}
    >
      {props.children}
    </ZeroProvider>
  )
}
