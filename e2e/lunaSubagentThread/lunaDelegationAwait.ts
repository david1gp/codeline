import { type BrowserContext, expect } from "@playwright/test"

export async function lunaDelegationAwait(
  context: BrowserContext,
  simulationSessionId: string,
  simulationAgentId: string,
): Promise<string> {
  let durableDelegation: { childAgentId?: string; childRunId: string } | undefined
  await expect
    .poll(
      async () => {
        const origin = process.env.PUBLIC_ORIGIN ?? "https://preview.codeline.work"
        const response = await context.request.get(`${origin}/api/sessions/${simulationSessionId}/delegations`)
        expect(response.ok(), await response.text()).toBe(true)
        const body = (await response.json()) as { delegations: Array<{ childAgentId?: string; childRunId: string }> }
        durableDelegation = body.delegations.find((candidate) => candidate.childAgentId === simulationAgentId)
        return durableDelegation?.childAgentId
      },
      {
        message: "The deterministic child delegation was not durably returned by the authorized API.",
        timeout: 120_000,
      },
    )
    .toBe(simulationAgentId)
  if (durableDelegation === undefined)
    throw new Error("The deterministic child delegation was not returned by the API.")
  return (durableDelegation as { childRunId: string }).childRunId
}
