export const connectionStatusSource = {
  app: "app",
  events: "events",
  api: "api",
} as const

export type ConnectionStatusSource = (typeof connectionStatusSource)[keyof typeof connectionStatusSource]
