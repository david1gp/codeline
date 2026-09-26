type SessionChatLunaPingDetectInput = {
  primaryAgentId: string
  prompt: string
}

export function sessionChatLunaPingDetect(input: SessionChatLunaPingDetectInput): boolean {
  if (input.prompt !== "ping") return false
  return input.primaryAgentId === "luna-high" || input.primaryAgentId.startsWith("luna-")
}
