import { buttonVariant } from "#ui/interactive/button/buttonCva.js"
import { CorvuPopoverIcon } from "#ui/interactive/popover/CorvuPopoverIcon.jsx"
import { ConnectionStatusDetails } from "./ConnectionStatusDetails.js"
import { connectionStatusKind } from "./connectionStatusKind.js"
import type { ConnectionStatusView } from "./connectionStatusView.js"

export function ConnectionStatusIndicator(props: { state: ConnectionStatusView }) {
  return (
    <CorvuPopoverIcon
      icon={props.state.icon()}
      iconClass={`size-4 ${
        props.state.isError()
          ? "fill-danger dark:fill-danger"
          : props.state.kind() === connectionStatusKind.ok
            ? "fill-success dark:fill-success"
            : "fill-warning dark:fill-warning"
      }`}
      title={
        props.state.durationLabel() ? `${props.state.label()} ${props.state.durationLabel()}` : props.state.label()
      }
      aria-label={
        props.state.durationLabel() ? `${props.state.label()} ${props.state.durationLabel()}` : props.state.label()
      }
      variant={props.state.isError() ? buttonVariant.outlineRed : buttonVariant.outline}
      innerClass="min-w-[240px] border border-line bg-surface-raised text-foreground shadow-lg"
      open={props.state.popoverOpen()}
      onOpenChange={props.state.popoverOpenChange}
    >
      <ConnectionStatusDetails state={props.state} />
    </CorvuPopoverIcon>
  )
}
