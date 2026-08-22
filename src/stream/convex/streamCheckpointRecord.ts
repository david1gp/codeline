export type StreamCheckpointRecord = {
  id: string
  lastSequence: number
  sessionId: string
  streamId: string
  updatedAt: number
}
