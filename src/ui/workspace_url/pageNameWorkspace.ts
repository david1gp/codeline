export type PageNameWorkspace = keyof typeof pageNameWorkspace

export const pageNameWorkspace = {
  sessions: "sessions",
  sessionsNew: "sessionsNew",
  sessionDetail: "sessionDetail",
} as const
