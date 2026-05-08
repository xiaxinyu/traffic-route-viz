# Copilot / AI review hints

- Canvas behavior and DoD: read `HARNESS_ENGINEERING.md` before changing UX, layout, import, PNG export, or session save/load.
- Module contracts: `SPEC_CODING.md` (Constraint Register). Touching handles or edges usually involves `buildGraph.ts`, `diagramPersist.ts`, and `FlowNodes.tsx`.
- After substantive edits, run `cd web && pnpm run ci`.
