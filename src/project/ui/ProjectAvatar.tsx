import { Show } from "solid-js"
import { projectAvatarStateCreate } from "./projectAvatarStateCreate.js"

export function ProjectAvatar(props: { name: string; class?: string; faviconUrl?: string | null }) {
  const state = projectAvatarStateCreate({ faviconUrl: () => props.faviconUrl, name: () => props.name })

  return (
    <Show
      when={state.showFavicon() ? props.faviconUrl : undefined}
      fallback={
        <span
          aria-hidden="true"
          class={`flex size-4 shrink-0 items-center justify-center rounded text-[10px] font-semibold uppercase leading-none ${props.class ?? ""}`}
          style={{ "background-color": state.background(), color: state.foreground() }}
        >
          {state.letter()}
        </span>
      }
    >
      {(faviconUrl) => (
        <img
          alt=""
          aria-hidden="true"
          class={`size-4 shrink-0 rounded object-contain ${props.class ?? ""}`}
          src={faviconUrl()}
          onError={state.faviconError}
        />
      )}
    </Show>
  )
}
