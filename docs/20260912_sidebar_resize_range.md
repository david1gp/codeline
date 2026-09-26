# Sidebar resize range

## Goal

Allow the left sidebar to be dragged narrower and wider, up to 80% of the screen width.

## Decisions

- Reduce the minimum sidebar width from 180px to 120px.
- Set the viewport-aware maximum to 80% of the screen width.
- Keep the resize handle's accessibility values synchronized with the active bounds.
- Reuse the existing resize and persistence behavior.

## Approach

- Update the application shell state to calculate and expose dynamic sidebar bounds.
- Update the resize handle ARIA metadata to use those bounds.
- Add focused unit coverage, then verify the managed combined preview in a browser.

## Tasks

- [x] 1. Implement dynamic sidebar resizing bounds and focused tests.
- [x] 2. Verify the change in the managed combined preview.
- [x] 3. Commit and push the completed change using the commits skill.
- [x] 4. Deploy the committed change.
