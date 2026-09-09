import { mdiDownloadOutline } from "@adaptive-ds/mdi/mdiDownloadOutline.js"
import { mdiUpdate } from "@adaptive-ds/mdi/mdiUpdate.js"
import { Show } from "solid-js"
import { ButtonIcon } from "#ui/interactive/button/ButtonIcon.jsx"
import { buttonVariant } from "#ui/interactive/button/buttonCva.js"
import type { PwaStatusView } from "./pwaStatusView.js"

export function PwaStatusActions(props: { placement: "settings" | "shell"; state: PwaStatusView }) {
  return (
    <>
      <Show when={props.placement === "settings"}>
        <div class="flex flex-wrap items-center gap-2">
          <Show when={props.state.installable()}>
            <ButtonIcon
              icon={mdiDownloadOutline}
              iconClass="size-4 fill-current dark:fill-current"
              variant={buttonVariant.outline}
              onClick={() => void props.state.install()}
            >
              Install app
            </ButtonIcon>
          </Show>
          <Show when={!props.state.installable()}>
            <p class="text-faint text-sm">
              Codeline is already installed, or installation is unavailable in this browser.
            </p>
          </Show>
        </div>
      </Show>

      <Show when={props.placement === "shell" && props.state.status() === "update-ready"}>
        <div class="flex flex-wrap items-center gap-2">
          <ButtonIcon
            icon={mdiUpdate}
            iconClass="size-4 fill-current dark:fill-current"
            variant={buttonVariant.outline}
            class="border-accent-border text-accent"
            onClick={props.state.reloadForUpdate}
          >
            Reload to update
          </ButtonIcon>
        </div>
      </Show>
    </>
  )
}
