import { ButtonIconOnly } from "#ui/interactive/button/ButtonIconOnly.jsx"
import { buttonVariant } from "#ui/interactive/button/buttonCva.js"
import type { ThemeSwitcherView } from "./themeSwitcherView.js"

export function ThemeSwitcher(props: { state: ThemeSwitcherView }) {
  return (
    <ButtonIconOnly
      icon={props.state.currentThemeIcon()}
      iconClass="size-4 fill-current dark:fill-current"
      variant={buttonVariant.outline}
      title={`Theme: ${props.state.currentThemeLabel()}. Switch to ${props.state.nextThemeLabel()}`}
      aria-label={`Theme: ${props.state.currentThemeLabel()}. Switch to ${props.state.nextThemeLabel()}`}
      onClick={props.state.themeCycle}
    />
  )
}
