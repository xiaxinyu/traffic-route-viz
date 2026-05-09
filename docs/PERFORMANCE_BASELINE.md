## Performance baseline (Issue #12)

Goal: keep canvas interactions responsive with **300+ nodes**.

### What to measure

- **Search / filter responsiveness**: typing in the search box should remain responsive.
- **Selection responsiveness**: clicking nodes/edges should not hitch noticeably.
- **Pan / zoom responsiveness**: dragging canvas / wheel zoom should remain smooth.

### Baseline setup

- Use a dataset that produces **≥ 300 nodes** (your largest real import set is best).
- Open DevTools → **Performance**:
  - Record 5–10 seconds while doing: search typing → click a few nodes → pan/zoom.
  - Check for long tasks / scripting spikes.

### Suggested quick checks (local)

```bash
cd web
pnpm run lint
pnpm run typecheck
pnpm run test
pnpm run build
```

### Known hot paths

- `web/src/graphViewState.ts` `buildGraphPresentation()`
  - Runs during interactions when search/type filter is enabled.
  - Must avoid repeatedly building large text corpuses for every node on every render.

