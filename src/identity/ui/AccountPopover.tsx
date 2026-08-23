import { mdiAccountCircleOutline } from "@adaptive-ds/mdi/mdiAccountCircleOutline.js"
import { mdiLogout } from "@adaptive-ds/mdi/mdiLogout.js"
import { Button } from "#ui/interactive/button/Button.jsx"
import { buttonSize, buttonVariant } from "#ui/interactive/button/buttonCva.js"
import { CorvuPopoverIcon } from "#ui/interactive/popover/CorvuPopoverIcon.jsx"
import { Icon } from "#ui/static/icon/Icon.jsx"
import { accountPopoverStateCreate } from "./accountPopoverStateCreate.js"
import type { AuthShellView } from "./authShellView.js"

export function AccountPopover(props: { auth: AuthShellView }) {
  const state = accountPopoverStateCreate(() => props.auth)

  return (
    <CorvuPopoverIcon
      icon={mdiAccountCircleOutline}
      title="Account"
      aria-label="Account"
      variant={buttonVariant.ghost}
      innerClass="w-[min(280px,calc(100vw-24px))] border border-line bg-surface-raised text-foreground shadow-lg"
      open={state.isOpen()}
      onOpenChange={state.openChange}
    >
      <div class="grid gap-3">
        <div class="grid gap-1 border-line-subtle border-b pb-3">
          <span class="font-medium text-sm">{props.auth.displayName()}</span>
          <span class="break-all font-mono text-faint text-xs">{props.auth.userId()}</span>
        </div>
        <Button
          variant={buttonVariant.ghost}
          size={buttonSize.none}
          class="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-surface-hover disabled:opacity-60"
          disabled={props.auth.busy()}
          onClick={state.logout}
        >
          <Icon path={mdiLogout} class="size-4 fill-current dark:fill-current" />
          {props.auth.busy() ? "Signing out…" : "Sign out"}
        </Button>
      </div>
    </CorvuPopoverIcon>
  )
}
