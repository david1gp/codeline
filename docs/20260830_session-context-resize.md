# Resizable Session Context Sidebar

## Goal

Allow the right Session Context sidebar on the projects session screen to be resized by the user, matching the existing sidebar resize interaction.

## Decisions

- Keep a 320px default desktop width.
- Allow widths from 240px to 520px while preserving usable conversation space.
- Persist the chosen width in local storage under a dedicated key.
- Put an accessible separator handle on the sidebar's left edge; dragging left widens it and dragging right narrows it.
- Support ArrowLeft/ArrowRight resizing with the existing 12px and Shift+Arrow 32px steps.
- Use stacked full-width layout with no handle at and below 1100px, preserving the desktop width for restoration above the breakpoint.
- Reuse the existing application-shell resize patterns and libraries.

## Approach

- Add dedicated Session Context width and resize state alongside existing application-shell sizing.
- Pass the state to the Session Context component, apply width through a CSS variable, and add a mirrored accessible handle.
- Cover persistence, bounds, pointer and keyboard direction, breakpoint transitions, and cleanup.
- Build and verify the interaction in the repository-managed preview.

## Tasks

- [x] 1. Implement persisted Session Context resize state and responsive lifecycle behavior.
- [x] 2. Wire the width and accessible left-edge resize handle into the Session Context sidebar.
- [x] 3. Add focused state, accessibility, CSS, and responsive tests.
- [x] 4. Build and verify resizing, persistence, and exact-breakpoint behavior in the managed preview.
