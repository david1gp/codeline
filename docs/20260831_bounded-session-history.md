# Bounded session history

## Goal

Open a session with the latest agent answer and about 25 recent semantic steps, keep live state current without transferring full history, load older context and tool/run details on demand, expose agents waiting for input, and open delegated child conversations from their parent timeline.

## Decisions

- Keep the canonical journal and finalized messages unchanged; optimize new read projections and transport payloads.
- Use one bounded, transactionally consistent session snapshot with a session `throughSeq`, latest answer, compact semantic steps, current run/input state, and an opaque older-page cursor.
- Page backward by stable message/semantic boundaries fixed to the snapshot `throughSeq`; never use offsets or paginate token deltas.
- Start the selected-session live tail strictly after `throughSeq`; retain only lightweight lifecycle/input-needed summaries on the user-wide feed.
- Represent tool and run timeline entries compactly and fetch full normalized details only when expanded.
- Treat `waiting_for_input` as explicit durable state only when supported by an authoritative runtime event; do not infer it from tool names.
- Navigate delegations with stable parent and child session IDs, using the existing right-side child conversation panel and the same bounded loading contract.
- Reuse existing repository libraries and generic `#ui` components; keep `./ui` read-only.

## Approach

- Current context: bounded snapshot/history contracts and focused schema coverage are complete; the transactional snapshot read model is next.
- Add backend schemas and transactional read models before changing existing selected-session reads.
- Introduce the bounded snapshot and fixed-watermark older-history API, then add lazy detail and child references.
- Migrate selected-session state to snapshot-plus-tail, retaining existing reconciliation behavior as fallback.
- Update the existing conversation and subagent panel UI rather than creating a new route or visual system.
- Verify each increment with focused tests at concurrency 1, then verify through the repository-managed combined preview service and browser.

## Tasks

- [x] 1. Add bounded snapshot, semantic-step, watermark, and cursor contracts with focused schema tests.
- [ ] 2. Implement the transactionally consistent bounded session snapshot repository/action/API and handoff tests.
- [ ] 3. Implement fixed-`throughSeq` backward keyset pagination for older semantic history and stability tests.
- [ ] 4. Add compact run/tool projections and lazy run/tool detail API with payload-boundary tests.
- [ ] 5. Add authoritative waiting-for-input projection and response handling where the runtime protocol supports it.
- [ ] 6. Add stable parent/child session references required for delegation navigation and API tests.
- [ ] 7. Migrate selected-session client state to bounded snapshot-plus-tail with incremental older-page loading.
- [ ] 8. Update the session UI to emphasize the latest answer, show about 25 recent semantic steps, load older steps, lazily expand details, display waiting state, and open child conversations.
- [ ] 9. Run focused and repository verification, then test the combined managed preview in a browser.
- [ ] 10. Review and publish the completed work with conventional commits, push, and deploy.
