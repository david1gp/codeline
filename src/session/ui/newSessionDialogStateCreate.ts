import { createEffect, type Accessor, useContext } from "solid-js"
import type { ProjectRegistryApiProject } from "../../project/api/projectRegistryApiProjectSchema.js"
import type { ProjectRegistryState } from "../../project/ui/projectRegistryState.js"
import { appShellContext } from "../../ui/appShellContext.js"
import type { ActiveProjectState } from "../../project/ui/activeProjectStateCreate.js"
import type { SessionProjectIdOverride } from "./sessionProjectIdOverride.js"
import type { SessionProjectPathOverride } from "./sessionProjectPathOverride.js"
import type { SessionTargetSelectorState } from "./sessionTargetSelectorStateCreate.js"
import { signalObjectCreate } from "../../ui/signalObjectCreate.js"

export type NewSessionProject =
  | ProjectRegistryApiProject
  | {
      available?: boolean
      id?: string
      label?: string
      projectLabel?: string
      projectPath?: string
    }

type NewSessionProjectItem = {
  available: boolean
  description?: string
  disabled?: boolean
  disabledReason?: string
  faviconUrl?: string | null
  id: string
  keywords?: readonly string[]
  label: string
  path?: string
}

type NewSessionDialogStateOptions = {
  activeProject: ActiveProjectState
  onOpenChange?: (open: boolean) => void
  open?: Accessor<boolean>
  projectIdOverride?: SessionProjectIdOverride
  projectPathOverride: SessionProjectPathOverride
  projectRegistry?: ProjectRegistryState
  projects?: Accessor<readonly NewSessionProject[]>
  sessionTarget: SessionTargetSelectorState
}

const newProjectOptionValue = "__new_project__"

function projectItemNormalize(item: NewSessionProject): NewSessionProjectItem {
  const id =
    "id" in item && typeof item.id === "string" ? item.id : "projectPath" in item ? (item.projectPath ?? "") : ""
  const label =
    "label" in item && typeof item.label === "string"
      ? item.label
      : "projectLabel" in item && typeof item.projectLabel === "string"
        ? item.projectLabel
        : id
  const available = "available" in item && typeof item.available === "boolean" ? item.available : true
  const path = "projectPath" in item && typeof item.projectPath === "string" ? item.projectPath : undefined
  const parentPath = "parentFolder" in item ? item.parentFolder?.label : undefined
  const displayPath = path ?? (parentPath ? `${parentPath.replace(/\/$/, "")}/${label}` : label)
  const faviconUrl = "faviconUrl" in item ? item.faviconUrl : undefined
  return {
    available,
    description: displayPath,
    disabled: !available,
    disabledReason: available ? undefined : "Unavailable",
    faviconUrl,
    id,
    keywords: parentPath ? [parentPath] : undefined,
    label,
    path,
  }
}

export function newSessionDialogStateCreate(options: NewSessionDialogStateOptions) {
  const appShell = useContext(appShellContext)
  const projectRegistry = options.projectRegistry ?? appShell?.projectRegistry
  const open = signalObjectCreate(false)
  const newProjectOpen = signalObjectCreate(false)
  const newProjectSelected = signalObjectCreate(false)
  const selectedProjectOverrideId = signalObjectCreate<string | null>(null)
  const formElement = signalObjectCreate<HTMLFormElement | null>(null)
  const searchInputElement = signalObjectCreate<HTMLInputElement | null>(null)
  let externalOpen: boolean | undefined

  const projects = (): readonly NewSessionProjectItem[] => {
    const raw: readonly NewSessionProject[] = projectRegistry
      ? projectRegistry.projects()
      : options.projects
        ? options.projects()
        : []
    const normalized = raw.map(projectItemNormalize)
    const current = options.activeProject.project()
    const activeItem: NewSessionProjectItem = {
      available: true,
      description: current.path,
      id: current.id ?? current.path,
      label: current.label,
      path: current.path,
    }
    const normalizedActive = normalized.find((project) => project.id === activeItem.id || project.path === current.path)
    const all: readonly NewSessionProjectItem[] = projectRegistry
      ? normalized
      : [normalizedActive ?? activeItem, ...normalized]
    const seen = new Set<string>()
    return all.filter((project) => {
      if (project.id.length === 0 || seen.has(project.id)) return false
      seen.add(project.id)
      return true
    })
  }

  const selectedProjectId = () => {
    if (newProjectSelected.get()) return newProjectOptionValue
    const override = selectedProjectOverrideId.get() ?? options.projectIdOverride?.get()
    if (override !== undefined && override !== null) {
      const match = projects().find((p) => p.id === override)
      if (match !== undefined && match.available) return override
    }
    const pathOverride = options.projectPathOverride.get()
    if (pathOverride !== null) {
      const match = projects().find((p) => (p.path === pathOverride || p.id === pathOverride) && p.available)
      if (match !== undefined) return match.id
    }
    const currentActive = options.activeProject.project()
    if (currentActive.id !== null && currentActive.id !== undefined) {
      const activeMatch = projects().find((p) => p.id === currentActive.id && p.available)
      if (activeMatch !== undefined) return activeMatch.id
    }
    const activePathMatch = projects().find(
      (p) => (p.path === currentActive.path || p.id === currentActive.path) && p.available,
    )
    if (activePathMatch !== undefined) return activePathMatch.id
    const firstAvailable = projects().find((p) => p.available)
    if (firstAvailable !== undefined) return firstAvailable.id
    return newProjectOptionValue
  }

  const selectedProjectPath = () => {
    if (newProjectSelected.get()) return newProjectOptionValue
    const id = selectedProjectId()
    const match = projects().find((p) => p.id === id)
    if (match !== undefined) return match.path ?? null
    return options.projectPathOverride.get() ?? options.activeProject.project().path
  }

  const openChange = (nextOpen: boolean, notifyExternal = true) => {
    open.set(nextOpen)
    if (notifyExternal) options.onOpenChange?.(nextOpen)
    if (nextOpen) {
      newProjectSelected.set(false)
      selectedProjectOverrideId.set(null)
      const current = options.activeProject.project()
      const availableList = projects()
      const currentMatch = availableList.find(
        (p) => (current.id ? p.id === current.id : p.path === current.path) && p.available,
      )
      if (currentMatch !== undefined) {
        options.projectIdOverride?.set(currentMatch.id)
        options.projectPathOverride.set(currentMatch.path ?? null)
      } else {
        const firstAvailable = availableList.find((p) => p.available)
        if (firstAvailable !== undefined) {
          options.projectIdOverride?.set(firstAvailable.id)
          options.projectPathOverride.set(firstAvailable.path ?? null)
        } else {
          options.projectIdOverride?.set(null)
          options.projectPathOverride.set(null)
        }
      }
    }
    if (!nextOpen) {
      newProjectSelected.set(false)
      selectedProjectOverrideId.set(null)
      options.projectIdOverride?.set(null)
      options.projectPathOverride.set(null)
      newProjectOpen.set(false)
    }
  }

  createEffect(() => {
    const nextOpen = options.open?.()
    if (nextOpen === undefined || nextOpen === externalOpen) return
    externalOpen = nextOpen
    if (nextOpen) openChange(true, false)
    else open.set(false)
  })

  // The project form is shown inside the same dialog, so only one modal is ever
  // open and the nested overlays cannot dismiss each other.
  const newProjectStart = () => newProjectOpen.set(true)
  const newProjectOpenChange = (nextOpen: boolean) => newProjectOpen.set(nextOpen)

  const projectChange = (projectIdOrPath: string) => {
    if (projectIdOrPath === newProjectOptionValue) {
      newProjectSelected.set(true)
      selectedProjectOverrideId.set(newProjectOptionValue)
      options.projectIdOverride?.set(null)
      options.projectPathOverride.set(null)
      return
    }
    const match = projects().find((p) => p.id === projectIdOrPath || p.path === projectIdOrPath)
    if (match === undefined || !match.available) return
    newProjectSelected.set(false)
    selectedProjectOverrideId.set(match.id)
    options.projectIdOverride?.set(match.id)
    options.projectPathOverride.set(match.path ?? null)
  }

  const projectSelectionConfirm = () => {
    const id = selectedProjectId()
    if (id === newProjectOptionValue) return
    const match = projects().find((p) => p.id === id)
    if (match === undefined || !match.available) return
    options.projectIdOverride?.set(match.id)
    options.projectPathOverride.set(match.path ?? null)
    open.set(false)
    options.onOpenChange?.(false)
    options.sessionTarget.sessionNew?.()
  }

  const formRequestSubmit = () => {
    formElement.get()?.requestSubmit()
  }

  const canCreateSession = () => {
    if (selectedProjectId() === newProjectOptionValue) return true
    if (!options.sessionTarget.canCreateSession()) return false
    const match = projects().find((p) => p.id === selectedProjectId())
    if (match === undefined) return false
    return match.available
  }

  return {
    canCreateSession,
    dialogDescription: () =>
      newProjectOpen.get()
        ? "Select an existing folder. Codeline will not create a directory."
        : "Choose the project for this session.",
    dialogTitle: () => (newProjectOpen.get() ? "New Project" : "New Session"),
    formSubmit: (event: SubmitEvent) => {
      event.preventDefault()
      if (selectedProjectId() === newProjectOptionValue) {
        newProjectStart()
        return
      }
      projectSelectionConfirm()
    },
    formRef: (element: HTMLFormElement) => formElement.set(element),
    formRequestSubmit,
    newProjectOpen: newProjectOpen.get,
    newProjectOpenChange,
    newProjectOptionValue,
    primaryActionLabel: () => {
      if (selectedProjectId() === newProjectOptionValue) return "New Project"
      return "Use project"
    },
    open: options.open ?? open.get,
    openChange,
    projectChange,
    projectSelectionConfirm,
    searchInputElement: () => searchInputElement.get() ?? undefined,
    searchInputRef: (element: HTMLInputElement) => searchInputElement.set(element),
    projectConfirmed: (projectPath: string, project?: ProjectRegistryApiProject) => {
      newProjectOpen.set(false)
      newProjectSelected.set(false)
      if (project !== undefined) {
        selectedProjectOverrideId.set(project.id)
        options.projectIdOverride?.set(project.id)
        options.projectPathOverride.set(null)
        return
      }
      projectChange(projectPath)
    },
    pickerItems: () => [
      ...projects(),
      {
        available: true,
        description: "Register an existing folder",
        id: newProjectOptionValue,
        label: "New Project",
      },
    ],
    projects,
    selectedProjectId,
    selectedProjectPath,
    sessionCreateErrorMessage: options.sessionTarget.sessionCreateErrorMessage,
    sessionCreateStatus: options.sessionTarget.sessionCreateStatus,
  }
}

export type NewSessionDialogState = ReturnType<typeof newSessionDialogStateCreate>
