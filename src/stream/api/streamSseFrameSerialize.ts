type StreamSseFrameSerializable = {
  data: unknown
  event: string
  id: string
}

export function streamSseFrameSerialize(frame: StreamSseFrameSerializable): string {
  return `id: ${frame.id}\nevent: ${frame.event}\ndata: ${JSON.stringify(frame.data) ?? "null"}\n\n`
}
