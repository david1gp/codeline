import type { ConvexClient } from "convex/browser"
import type { JSX } from "solid-js"
import { Show } from "solid-js"
import { codelineConvexProviderStateCreate } from "./codelineConvexProviderStateCreate.js"
import { convexContext } from "./convexContext.js"

export function CodelineConvexProvider(props: { children: JSX.Element; organizationId?: string; token?: string }) {
  const state = codelineConvexProviderStateCreate(props.token)

  return (
    <Show when={state.client && state.token} fallback={props.children}>
      {(client) => (
        <convexContext.Provider
          value={{
            client: client() as unknown as ConvexClient,
            ...(props.organizationId === undefined ? {} : { organizationId: props.organizationId }),
            token: state.token as string,
          }}
        >
          {props.children}
        </convexContext.Provider>
      )}
    </Show>
  )
}
