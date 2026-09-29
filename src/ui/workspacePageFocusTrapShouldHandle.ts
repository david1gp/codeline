export function workspacePageFocusTrapShouldHandle(
  activeLayerOutsideDrawer: boolean,
  activeLayerOwnedByDrawer: boolean,
): boolean {
  return !activeLayerOutsideDrawer || activeLayerOwnedByDrawer
}
