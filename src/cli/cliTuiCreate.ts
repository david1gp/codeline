import { createResult, type Result } from "@adaptive-ds/result"
import {
  Box,
  Editor,
  Markdown,
  matchesKey,
  ProcessTerminal,
  type Terminal,
  Text,
  TuiMainScreen,
} from "@earendil-works/pi-tui"
import type { ResolvedCliTheme } from "./cliThemeLoad.js"
import { cliTuiThemeCreate } from "./cliTuiThemeCreate.js"

export type CliTui = {
  start: () => void
  stop: () => void
  sessionSet: (sessionId: string) => void
  statusSet: (status: string) => void
  transcriptAdd: (role: "user" | "assistant", text: string) => void
  assistantAppend: (chunk: string) => void
  assistantComplete: () => void
  assistantDiscard: () => void
  inputSet: (text: string) => void
  busySet: (busy: boolean) => void
}

export type CliTuiOptions = {
  theme: ResolvedCliTheme
  terminal?: Terminal
  onSubmit: (text: string) => void
  onCancel: () => void
}

/** UI-only adapter. The caller owns sessions, runs, persistence, cancellation and lifecycle. */
export function cliTuiCreate(options: CliTuiOptions): Result<CliTui> {
  const adapted = cliTuiThemeCreate(options.theme)
  if (!adapted.success) return adapted
  const theme = adapted.data
  const terminal = options.terminal ?? new ProcessTerminal()
  const tui = new TuiMainScreen(terminal)
  const transcript = new Box(0, 0)
  const status = new Text("", 0, 0)
  const editor = new Editor(tui, theme.editor)
  let sessionId = ""
  let statusText = "Ready"
  let active: Markdown | undefined
  let partial = ""
  let started = false
  let busy = false

  const statusRender = () => {
    status.setText(
      theme.status(
        `${sessionId ? `Session ${sessionId} · ` : ""}${statusText} · Enter submit · Ctrl+C ${busy ? "cancel" : "exit"}`,
      ),
    )
    tui.requestRender()
  }
  const transcriptAdd = (role: "user" | "assistant", text: string) => {
    if (role === "assistant") {
      transcript.addChild(new Markdown(text, 0, 1, theme.markdown, theme.assistantText))
    } else {
      transcript.addChild(new Text(theme.user(`You: ${text}`), 0, 1))
    }
    tui.requestRender()
  }

  editor.onSubmit = (text) => {
    if (!text) return
    if (busy) {
      editor.setText(text)
      statusText = "Wait for the current turn or press Ctrl+C to cancel"
      statusRender()
      return
    }
    transcriptAdd("user", text)
    options.onSubmit(text)
  }
  tui.addInputListener((data) => {
    if (!matchesKey(data, "ctrl+c")) return
    options.onCancel()
    return { consume: true }
  })
  tui.addChild(transcript)
  tui.addChild(status)
  tui.addChild(editor)
  tui.setFocus(editor)
  statusRender()

  return createResult({
    start: () => {
      if (started) return
      try {
        tui.start()
        started = true
      } catch (error) {
        // Pi may have entered raw mode before a later start hook fails.
        terminal.stop()
        throw error
      }
    },
    stop: () => {
      if (!started) return
      started = false
      try {
        tui.stop()
      } catch (error) {
        // Pi's stop is not exception-safe when a stop hook fails.
        terminal.stop()
        throw error
      }
    },
    sessionSet: (id) => {
      sessionId = id
      statusRender()
    },
    statusSet: (value) => {
      statusText = value
      statusRender()
    },
    transcriptAdd,
    assistantAppend: (chunk) => {
      if (!chunk) return
      if (!active) {
        active = new Markdown("", 0, 1, theme.markdown, theme.assistantText)
        transcript.addChild(active)
      }
      partial += chunk
      active.setText(partial)
      tui.requestRender()
    },
    assistantComplete: () => {
      active = undefined
      partial = ""
    },
    assistantDiscard: () => {
      if (active) active.setText("_(incomplete response; partial output discarded)_")
      active = undefined
      partial = ""
      tui.requestRender()
    },
    inputSet: (text) => editor.setText(text),
    busySet: (value) => {
      busy = value
      statusRender()
    },
  })
}
