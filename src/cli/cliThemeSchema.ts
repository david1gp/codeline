import * as v from "valibot"

const colorValueSchema = v.union([v.string(), v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(255))])

const requiredColorNames = [
  "accent",
  "border",
  "borderAccent",
  "borderMuted",
  "success",
  "error",
  "warning",
  "muted",
  "dim",
  "text",
  "thinkingText",
  "selectedBg",
  "userMessageBg",
  "userMessageText",
  "customMessageBg",
  "customMessageText",
  "customMessageLabel",
  "toolPendingBg",
  "toolSuccessBg",
  "toolErrorBg",
  "toolTitle",
  "toolOutput",
  "mdHeading",
  "mdLink",
  "mdLinkUrl",
  "mdCode",
  "mdCodeBlock",
  "mdCodeBlockBorder",
  "mdQuote",
  "mdQuoteBorder",
  "mdHr",
  "mdListBullet",
  "toolDiffAdded",
  "toolDiffRemoved",
  "toolDiffContext",
  "syntaxComment",
  "syntaxKeyword",
  "syntaxFunction",
  "syntaxVariable",
  "syntaxString",
  "syntaxNumber",
  "syntaxType",
  "syntaxOperator",
  "syntaxPunctuation",
  "thinkingOff",
  "thinkingMinimal",
  "thinkingLow",
  "thinkingMedium",
  "thinkingHigh",
  "thinkingXhigh",
  "bashMode",
] as const

const optionalColorNames = [
  "scrollbarTrack",
  "scrollbarThumb",
  "searchMatchBg",
  "searchMatchText",
  "thinkingMax",
] as const

const colorEntries = Object.fromEntries([
  ...requiredColorNames.map((name) => [name, colorValueSchema]),
  ...optionalColorNames.map((name) => [name, v.optional(colorValueSchema)]),
])

export const cliThemeSchema = v.strictObject({
  $schema: v.optional(v.string()),
  name: v.pipe(v.string(), v.regex(/^[^/]+$/)),
  appearance: v.optional(v.union([v.literal("dark"), v.literal("light")])),
  vars: v.optional(v.record(v.string(), colorValueSchema)),
  colors: v.strictObject(colorEntries),
  export: v.optional(
    v.strictObject({
      pageBg: v.optional(colorValueSchema),
      cardBg: v.optional(colorValueSchema),
      infoBg: v.optional(colorValueSchema),
    }),
  ),
})

export type CliTheme = v.InferOutput<typeof cliThemeSchema>
export type CliThemeColorValue = v.InferOutput<typeof colorValueSchema>
