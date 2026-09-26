export const demoSessionMessagesFixture = [
  {
    content: "Review the workspace screen and tell me which panels are backend independent now.",
    role: "user",
  },
  {
    content: [
      "The workspace screen renders from an injected view contract:",
      "",
      "- `SessionList` reads a fixture-backed branch tree.",
      "- `SelectedSession` reads fixture messages and a local composer.",
      "- `SessionTargetSelector` and `ProviderModelSelector` read fixture options.",
      "",
      "```ts",
      "const state = workspaceScreenStateCreate()",
      "```",
    ].join("\n"),
    role: "assistant",
  },
  {
    content: "Good. Keep the production composition unchanged.",
    role: "user",
  },
] as const
