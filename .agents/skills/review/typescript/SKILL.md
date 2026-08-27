---
name: review-typescript
description: Review TypeScript changes for one-export-per-file, subject-first naming, and Result-based error handling.
---

# Review TypeScript

Check that each module exports a single subject-first symbol, that failures are returned as `Result`
values instead of thrown, and that `.tsx` files stay view-only.
