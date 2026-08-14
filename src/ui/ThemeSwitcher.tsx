import type { ThemeSwitcherView } from "./themeSwitcherView.js"

export function ThemeSwitcher(props: { state: ThemeSwitcherView }) {
  return (
    <button
      class="grid size-9 shrink-0 place-items-center rounded-lg border border-[var(--border)] text-[var(--muted-foreground)] no-underline hover:border-[var(--accent)] hover:text-[var(--accent)]"
      type="button"
      aria-label={`Theme: ${props.state.currentThemeLabel()}. Switch to ${props.state.nextThemeLabel()}`}
      title={`Theme: ${props.state.currentThemeLabel()}. Switch to ${props.state.nextThemeLabel()}`}
      onClick={props.state.themeCycle}
    >
      <svg aria-hidden="true" class="size-4" viewBox="0 0 24 24" fill="currentColor">
        <path d={props.state.currentThemeIcon()} />
      </svg>
    </button>
  )
}
