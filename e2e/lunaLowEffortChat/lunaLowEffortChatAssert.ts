import { expect, type Page, type Request } from "@playwright/test"

export async function lunaLowEffortChatAssert(page: Page, sessionId: string, chatRequest: Request): Promise<void> {
  expect(chatRequest.postDataJSON()).toEqual({
    context: [
      {
        codelineExecution: {
          agentId: "luna-high",
          model: "gpt-5.6-luna",
          provider: "codex-lb",
          reasoningEffort: "low",
        },
      },
    ],
    forwardedProps: {
      codelineExecution: { agentId: "luna-high", model: "gpt-5.6-luna", provider: "codex-lb", reasoningEffort: "low" },
    },
    messages: [{ content: "ping", id: expect.any(String), role: "user" }],
    runId: expect.any(String),
    threadId: sessionId,
    tools: [],
  })
  const recentActivity = page.getByRole("list", { name: "Recent semantic activity", exact: true })
  const latestAnswer = page.getByRole("region", { name: "Response", exact: true })
  const userMessages = recentActivity.locator("li[data-session-message-role='user']")
  await expect(latestAnswer).toHaveCount(1, { timeout: 120_000 })
  await expect(userMessages).toHaveCount(1, { timeout: 120_000 })
  await expect(latestAnswer.getByText("pong", { exact: true })).toBeVisible({ timeout: 120_000 })
  await expect(userMessages.getByText("ping", { exact: true })).toBeVisible({ timeout: 120_000 })
  await expect(page.getByRole("list", { name: "Run failures" })).toHaveCount(0, { timeout: 120_000 })
  await expect(page.getByRole("alert")).toHaveCount(0, { timeout: 120_000 })
}
