import { projectAvatarStateCreate } from "./projectAvatarStateCreate.js"

export function ProjectAvatar(props: { name: string; class?: string }) {
  const state = projectAvatarStateCreate({ name: () => props.name })

  return (
    <span
      aria-hidden="true"
      class={`flex size-4 shrink-0 items-center justify-center rounded text-[10px] font-semibold uppercase leading-none ${props.class ?? ""}`}
      style={{ "background-color": state.background(), color: state.foreground() }}
    >
      {state.letter()}
    </span>
  )
}
