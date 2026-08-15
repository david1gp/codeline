import type { JSX } from "solid-js"
import { Show } from "solid-js"
import type { applicationShellStateCreate } from "./applicationShellStateCreate.js"

type ApplicationShellProps = {
  children: JSX.Element
  leftSidebar: JSX.Element
  rightPanel?: JSX.Element
  rightPanelLabel?: string
  state: ReturnType<typeof applicationShellStateCreate>
}

export function ApplicationShell(props: ApplicationShellProps) {
  return (
    <main
      class="application-shell"
      style={{
        "--right-panel-width": `${props.state.rightPanelWidth()}px`,
        "--sidebar-width": `${props.state.sidebarWidth()}px`,
      }}
    >
      <aside class="application-shell-sidebar" aria-label="Workspace navigation">
        {props.leftSidebar}
      </aside>
      <hr
        class="application-shell-resize-handle application-shell-sidebar-resize-handle"
        classList={{ "is-resizing": props.state.isResizing("sidebar") }}
        tabIndex={0}
        aria-label="Resize workspace sidebar"
        aria-orientation="vertical"
        aria-valuemin="180"
        aria-valuemax="480"
        aria-valuenow={props.state.sidebarWidth()}
        onKeyDown={(event) => props.state.resizeKeyDown("sidebar", event)}
        onPointerCancel={props.state.resizeCancel}
        onPointerDown={(event) => props.state.resizeStart("sidebar", event)}
        onLostPointerCapture={props.state.resizeEnd}
        onPointerMove={props.state.resizeMove}
        onPointerUp={props.state.resizeEnd}
      />

      <section class="application-shell-content">{props.children}</section>

      <Show when={props.rightPanel !== undefined && props.state.rightPanelOpen()}>
        <button
          class="application-shell-right-backdrop"
          type="button"
          aria-label="Close right panel"
          onClick={props.state.rightPanelClose}
        />
        <hr
          class="application-shell-resize-handle application-shell-right-resize-handle"
          classList={{ "is-resizing": props.state.isResizing("right-panel") }}
          tabIndex={0}
          aria-label="Resize right panel"
          aria-orientation="vertical"
          aria-valuemin="300"
          aria-valuemax="1200"
          aria-valuenow={props.state.rightPanelWidth()}
          onKeyDown={(event) => props.state.resizeKeyDown("right-panel", event)}
          onPointerCancel={props.state.resizeCancel}
          onPointerDown={(event) => props.state.resizeStart("right-panel", event)}
          onLostPointerCapture={props.state.resizeEnd}
          onPointerMove={props.state.resizeMove}
          onPointerUp={props.state.resizeEnd}
        />
        <aside
          id="workspace-right-panel"
          class="application-shell-right-panel"
          aria-label={props.rightPanelLabel ?? "Workspace details"}
        >
          {props.rightPanel}
        </aside>
      </Show>
    </main>
  )
}
