import { mdiFolderPlusOutline } from "@adaptive-ds/mdi/mdiFolderPlusOutline.js"
import { type JSX } from "solid-js"
import { buttonVariant } from "#ui/interactive/button/buttonCva.js"
import { CorvuDialog } from "#ui/interactive/dialog/CorvuDialog.jsx"
import type { ActiveProjectState } from "./activeProjectStateCreate.js"
import { NewProjectForm } from "./NewProjectForm.js"
import { newProjectDialogStateCreate } from "./newProjectDialogStateCreate.js"

export function NewProjectDialog(props: {
  activeProject: ActiveProjectState
  buttonClass?: string
  buttonChildren?: JSX.Element
  idPrefix: string
  onProjectConfirmed?: (projectPath: string) => void
  onOpenChange?: (open: boolean) => void
  open?: () => boolean
}) {
  const state = newProjectDialogStateCreate({
    activeProject: props.activeProject,
    idPrefix: props.idPrefix,
    onProjectConfirmed: props.onProjectConfirmed,
    open: props.open,
  })

  return (
    <CorvuDialog
      title="New Project"
      description="Select an existing folder. Codeline will not create a directory."
      buttonChildren={props.buttonChildren ?? "New Project"}
      class={props.buttonClass ?? "h-8 w-full justify-start px-2 text-xs font-normal text-faint"}
      icon={mdiFolderPlusOutline}
      iconClass="size-4"
      innerClass="w-[min(92vw,36rem)]"
      open={state.open()}
      onOpenChange={(open) => {
        state.openChange(open)
        props.onOpenChange?.(open)
      }}
      variant={buttonVariant.ghost}
    >
      <NewProjectForm state={state} />
    </CorvuDialog>
  )
}
