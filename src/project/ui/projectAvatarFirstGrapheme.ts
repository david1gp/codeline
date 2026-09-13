const graphemeSegmenter =
  typeof Intl.Segmenter === "function" ? new Intl.Segmenter(undefined, { granularity: "grapheme" }) : undefined

export function projectAvatarFirstGrapheme(name: string): string {
  if (name === "") {
    return ""
  }

  if (graphemeSegmenter) {
    for (const segment of graphemeSegmenter.segment(name)) {
      return segment.segment
    }
  }

  return Array.from(name)[0] ?? ""
}
