import { describe, expect, test } from "bun:test"
import { ProcessTerminal, type Terminal } from "@earendil-works/pi-tui"
import { cliThemeLoad } from "./cliThemeLoad.js"
import { cliTuiColorAnsi } from "./cliTuiColorAnsi.js"
import { cliTuiCreate } from "./cliTuiCreate.js"
import { cliTuiThemeCreate } from "./cliTuiThemeCreate.js"

class FakeTerminal implements Terminal {
  output = ""
  onInput?: (data: string) => void
  starts = 0
  stops = 0
  get columns() {
    return 80
  }
  get rows() {
    return 24
  }
  get kittyProtocolActive() {
    return false
  }
  start(onInput: (data: string) => void, _onResize: () => void) {
    this.onInput = onInput
    this.starts++
  }
  stop() {
    this.onInput = undefined
    this.stops++
  }
  async drainInput() {}
  write(data: string) {
    this.output += data
  }
  moveBy(_lines: number) {}
  hideCursor() {}
  showCursor() {}
  clearLine() {}
  clearFromCursor() {}
  clearScreen() {}
  setTitle(_title: string) {}
  setProgress(_active: boolean) {}
  input(data: string) {
    this.onInput?.(data)
  }
}

describe("Pi terminal adapter", () => {
  test("Bun imports published Pi TUI and constructs ProcessTerminal without starting stdin", () => {
    const terminal = new ProcessTerminal()
    expect(terminal).toBeInstanceOf(ProcessTerminal)
    expect(typeof terminal.start).toBe("function")
    expect(typeof terminal.stop).toBe("function")
    expect(terminal.columns).toBeGreaterThan(0)
    expect(terminal.rows).toBeGreaterThan(0)
  })

  test("loads built-in Pi palettes and maps semantic component colors", async () => {
    for (const name of ["dark", "light"] as const) {
      const loaded = await cliThemeLoad(name, { HOME: "/tmp/opencode", XDG_CONFIG_HOME: "/tmp/opencode" })
      expect(loaded.success).toBe(true)
      if (!loaded.success) continue
      expect(loaded.data.sourcePath).toBe(`builtin:${name}`)
      expect(loaded.data.theme.appearance).toBe(name)
      const adapted = cliTuiThemeCreate(loaded.data)
      expect(adapted.success).toBe(true)
      if (!adapted.success) continue
      expect(adapted.data.markdown.heading("heading")).toContain("heading")
      expect(adapted.data.markdown.heading("heading")).toContain("\x1b[38;2;")
      expect(adapted.data.editor.borderColor("─")).toContain("\x1b[38;2;")
      expect(adapted.data.status("status")).toContain("status")
    }
  })

  test("resolves ANSI indexes, default, hex, okhsl, oklch and rejects unsupported colors", () => {
    const trueColorSequence = new RegExp(`^${"\x1b"}\\[38;2;\\d+;\\d+;\\d+m$`)
    expect(cliTuiColorAnsi(31)).toBe("\x1b[38;5;31m")
    expect(cliTuiColorAnsi("default")).toBe("")
    expect(cliTuiColorAnsi("#123456", true)).toBe("\x1b[48;2;18;52;86m")
    expect(cliTuiColorAnsi("okhsl(234 3% 89%)")).toMatch(trueColorSequence)
    expect(cliTuiColorAnsi("oklch(0.7 0.1 30)")).toMatch(trueColorSequence)
    expect(() => cliTuiColorAnsi("garbage")).toThrow()
  })

  test("renders ordinary assistant prose in text color and user prose with message foreground and background", async () => {
    const loaded = await cliThemeLoad("dark", { HOME: "/tmp/opencode", XDG_CONFIG_HOME: "/tmp/opencode" })
    expect(loaded.success).toBe(true)
    if (!loaded.success) return
    const terminal = new FakeTerminal()
    const result = cliTuiCreate({
      theme: {
        ...loaded.data,
        colors: {
          ...loaded.data.colors,
          text: "#112233",
          userMessageText: "#445566",
          userMessageBg: "#778899",
          mdHeading: "#aabbcc",
        },
      },
      terminal,
      onSubmit: () => {},
      onCancel: () => {},
    })
    expect(result.success).toBe(true)
    if (!result.success) return
    const ui = result.data
    ui.start()
    try {
      ui.transcriptAdd("user", "User plain prose")
      ui.transcriptAdd("assistant", "Saved plain prose")
      ui.assistantAppend("Streaming plain prose")
      await Bun.sleep(40)
      expect(terminal.output).toContain("\x1b[48;2;119;136;153m\x1b[38;2;68;85;102mYou: User plain prose")
      expect(terminal.output).toContain("\x1b[38;2;17;34;51mSaved plain prose")
      expect(terminal.output).toContain("\x1b[38;2;17;34;51mStreaming plain prose")
    } finally {
      ui.stop()
    }
  })

  test("keeps editor and session alive across submissions, streams Markdown, and sends Ctrl+C to cancel", async () => {
    const theme = await cliThemeLoad("dark", { HOME: "/tmp/opencode", XDG_CONFIG_HOME: "/tmp/opencode" })
    expect(theme.success).toBe(true)
    if (!theme.success) return
    const terminal = new FakeTerminal()
    const submissions: string[] = []
    let cancellations = 0
    const result = cliTuiCreate({
      theme: theme.data,
      terminal,
      onSubmit: (value) => submissions.push(value),
      onCancel: () => {
        cancellations++
      },
    })
    expect(result.success).toBe(true)
    if (!result.success) return
    const ui = result.data
    ui.sessionSet("session-1")
    ui.statusSet("Running")
    ui.start()
    ui.start()
    terminal.input("Hello")
    terminal.input("\r")
    expect(submissions).toEqual(["Hello"])
    ui.assistantAppend("**Hello")
    ui.assistantAppend(" back**")
    ui.assistantComplete()
    ui.assistantAppend("Unfinished partial")
    ui.assistantDiscard()
    ui.transcriptAdd("assistant", "Second reply")
    ui.inputSet("Next")
    terminal.input("\x03")
    expect(cancellations).toBe(1)
    terminal.input("\r")
    expect(submissions).toEqual(["Hello", "Next"])
    await Bun.sleep(40)
    expect(terminal.output).toContain("session-1")
    expect(terminal.output).toContain("Hello back")
    expect(terminal.output).toContain("incomplete response; partial output discarded")
    expect(terminal.output).toContain("Second reply")
    ui.stop()
    ui.stop()
    expect(terminal.starts).toBe(1)
    expect(terminal.stops).toBe(1)
  })
})
