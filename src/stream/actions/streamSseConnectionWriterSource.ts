export type StreamSseConnectionWriterSource<TEvent> = {
  subscribe: (userId: string, subscriber: (event: TEvent) => void) => () => void
}
