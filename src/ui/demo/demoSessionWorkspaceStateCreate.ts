import { createSignalObject } from "@adaptive-ds/solid-ui/utils/createSignalObject"
import { createEffect } from "solid-js"
import { demoFilesScreenStateCreate } from "./demoFilesScreenStateCreate.js"
import { demoSelectedSessionStateCreate } from "./demoSelectedSessionStateCreate.js"
import type { DemoSessionWorkspaceFixture } from "./demoSessionWorkspaceFixture.js"

export function demoSessionWorkspaceStateCreate(fixture: () => DemoSessionWorkspaceFixture | undefined) {
  const rightPanelOpen = createSignalObject(true)
  let previousFixture = fixture()
  createEffect(() => {
    const currentFixture = fixture()
    if (currentFixture === previousFixture) return
    previousFixture = currentFixture
    rightPanelOpen.set(true)
  })
  const sessionVariant = () => fixture()?.sessionVariant ?? "ready"
  const filesVariant = () => fixture()?.filesVariant ?? "ready"
  const browserVariant = () => fixture()?.browserVariant ?? "ready"
  const selectedSessionId = {
    get: () => {
      if (sessionVariant() === "empty") return null
      if (sessionVariant() === "streaming") return "demo-session-streaming"
      if (sessionVariant() === "waiting") return "demo-session-catalog"
      return "demo-session-workspace"
    },
  }

  return {
    files: demoFilesScreenStateCreate(filesVariant, browserVariant),
    rightPanelClose: () => rightPanelOpen.set(false),
    rightPanelOpen: rightPanelOpen.get,
    rightPanelShow: () => rightPanelOpen.set(true),
    selectedSession: demoSelectedSessionStateCreate({
      rightPanelClose: () => rightPanelOpen.set(false),
      rightPanelShow: () => rightPanelOpen.set(true),
      selectedSessionId,
      variant: sessionVariant,
    }),
  }
}
