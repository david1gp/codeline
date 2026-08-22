export type StreamEventRecord = {
  createdAt: number
  eventType: string
  id: string
  idempotencyKey: string
  payload: unknown
  sequence: number
  sessionId: string
  streamId: string
}
