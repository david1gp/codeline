import { ZeroProvider } from "@rocicorp/zero/solid"
import type { JSX } from "solid-js"
import { zeroSchema } from "../database/zeroSchema.js"
import { noteMutators } from "../note/noteMutators.js"

const localZeroCacheUrl = "http://127.0.0.1:6003"
const localDevelopmentUserId = "development:local-development"
const localDevelopmentIdentity = "local-development"

export function CodelineZeroProvider(props: { children: JSX.Element }) {
  return (
    <ZeroProvider
      context={{ userId: localDevelopmentUserId }}
      mutators={noteMutators}
      cacheURL={import.meta.env.VITE_ZERO_CACHE_URL ?? localZeroCacheUrl}
      schema={zeroSchema}
      userID={localDevelopmentIdentity}
    >
      {props.children}
    </ZeroProvider>
  )
}
