export const connectionStatusSource = {
  app: "app",
  zero: "zero",
  api: "api",
} as const

export type ConnectionStatusSource = (typeof connectionStatusSource)[keyof typeof connectionStatusSource]
