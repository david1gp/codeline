import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { DefaultTextStyle, EditorTheme, MarkdownTheme } from "@earendil-works/pi-tui"
import type { ResolvedCliTheme } from "./cliThemeLoad.js"
import { cliTuiColorAnsi } from "./cliTuiColorAnsi.js"

export type CliTuiTheme = {
  editor: EditorTheme
  markdown: MarkdownTheme
  assistantText: DefaultTextStyle
  user: (text: string) => string
  status: (text: string) => string
}

/** Adapts resolved Pi coding-agent color tokens to pi-tui's semantic component themes. */
export function cliTuiThemeCreate(theme: ResolvedCliTheme): Result<CliTuiTheme> {
  const op = "cliTuiThemeCreate"
  try {
    const parsed = Object.fromEntries(
      Object.entries(theme.colors).map(([name, value]) => [
        name,
        [cliTuiColorAnsi(value), cliTuiColorAnsi(value, true)],
      ]),
    ) as Record<string, [string, string]>
    const color = (name: string, text: string): string => {
      const prefix = parsed[name]?.[0]
      return prefix ? `${prefix}${text}\x1b[39m` : text
    }
    const background = (name: string, text: string): string => {
      const prefix = parsed[name]?.[1]
      return prefix ? `${prefix}${text}\x1b[49m` : text
    }
    return createResult({
      editor: {
        borderColor: (text) => color("borderAccent", text),
        selectList: {
          selectedPrefix: (text) => color("accent", text),
          selectedText: (text) => background("selectedBg", color("text", text)),
          description: (text) => color("muted", text),
          scrollInfo: (text) => color("dim", text),
          noMatch: (text) => color("warning", text),
        },
      },
      markdown: {
        heading: (text) => color("mdHeading", text),
        link: (text) => color("mdLink", text),
        linkUrl: (text) => color("mdLinkUrl", text),
        code: (text) => color("mdCode", text),
        codeBlock: (text) => color("mdCodeBlock", text),
        codeBlockBorder: (text) => color("mdCodeBlockBorder", text),
        quote: (text) => color("mdQuote", text),
        quoteBorder: (text) => color("mdQuoteBorder", text),
        hr: (text) => color("mdHr", text),
        listBullet: (text) => color("mdListBullet", text),
        bold: (text) => `\x1b[1m${text}\x1b[22m`,
        italic: (text) => `\x1b[3m${text}\x1b[23m`,
        strikethrough: (text) => `\x1b[9m${text}\x1b[29m`,
        underline: (text) => `\x1b[4m${text}\x1b[24m`,
      },
      assistantText: { color: (text) => color("text", text) },
      user: (text) => background("userMessageBg", color("userMessageText", text)),
      status: (text) => color("muted", text),
    })
  } catch (error) {
    return createResultError(op, `Invalid terminal theme color: ${String(error)}`)
  }
}
