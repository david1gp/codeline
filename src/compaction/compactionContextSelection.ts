import type { CompactionMessage } from "./compactionMessage.js"

export type CompactionContextSelection = {
  compacted: readonly CompactionMessage[]
  context: readonly CompactionMessage[]
  cutIndex: number
  retained: readonly CompactionMessage[]
}
