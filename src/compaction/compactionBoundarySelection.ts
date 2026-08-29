import type { CompactionMessage } from "./compactionMessage.js"

export type CompactionBoundarySelection = {
  compacted: readonly CompactionMessage[]
  cutIndex: number
  retained: readonly CompactionMessage[]
  retainedTokenEstimate: number
}
