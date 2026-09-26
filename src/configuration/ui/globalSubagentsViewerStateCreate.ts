import { createSignalObject } from "@adaptive-ds/solid-ui/utils/createSignalObject"
import { onMount } from "solid-js"
import type { ProviderApiAgentsResponse } from "../../providers/api/providerApiAgentsResponseSchema.js"
import { providerAgentsClientCreate } from "../../providers/client/providerAgentsClientCreate.js"

export function globalSubagentsViewerStateCreate(client = providerAgentsClientCreate()) {
  const agents = createSignalObject<ProviderApiAgentsResponse["agents"]>([])
  const loading = createSignalObject(true)
  const error = createSignalObject("")
  const load = async () => {
    loading.set(true)
    error.set("")
    const result = await client.list()
    if (result.success) agents.set(result.data.agents)
    else error.set(result.errorMessage)
    loading.set(false)
  }
  onMount(() => { void load() })
  return { agents: () => agents.get(), loading: () => loading.get(), error: () => error.get(), load }
}
