# Goal
Provide separate unauthenticated `/demo/...` pages with deterministic test data for visually testing the redesigned session main area and right sidebar.

# Decisions
- Extend the existing demo catalog and checked-in fixtures; no database resets or backend dependencies.
- Cover meaningfully different session and sidebar states, not cosmetic duplicates.
- Reuse production presentation where practical so demos verify the actual redesign.
- Use existing libraries and generic UI components.

# Approach
Inspect existing demo composition, add focused scenarios and any minimal presentation sharing required, then visually verify each page on the managed combined preview.

# Tasks
1. Completed: implement deterministic `session-completed`, `session-generating`, `session-waiting`, `session-error`, `session-loading`, and `session-empty` pages under `/demo/screens/`, reusing production session and file-panel components.
2. Completed: browser-verify pages on desktop and mobile, including local Stop and file-panel close/reopen interactions.
3. Commit portion completed: commit the verified session demo changes; deployment remains pending.
