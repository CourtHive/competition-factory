---
title: validMatchUp
---

# validMatchUp

:::warning 8.0.0 engine API transition

This method is **scheduled for removal from production governors and engine exports at 8.0.0**. Its 7.x route still works. The removal list was confirmed with external integrators on 2026-10-28 and closed on 2026-11-22. The standalone package-export decision is made per method; see the [transition index](/docs/implementation/engine-api-transition-8).

:::

## Source-local contract

The declaration below is copied from the pinned source revision; referenced types are defined there. It is an implementation signature, not a package import example.

```text
export function validMatchUp(matchUp);
```

## Engine effects

**State writes:** not yet assessed. **Notices:** not yet assessed. Governor query/mutate placement is not proof of purity; review the implementation and engine path before deciding exposure.

## Consumer evidence

The refreshed source-name scan found no name mentions in the scanned product source files. This does not establish external-integrator non-use. The manifest records repository revisions and scan exclusions. External-integrator review (2026-10-28) found no use, and the removal list was closed on 2026-11-22.

## Availability and ownership

- **Production governor declarations:** `matchUpGovernor`, `queryGovernor`.
- **Standalone package API after 8.0.0:** decision pending; this page does not establish a supported import.
- **Implementation:** [`src/validators/validMatchUp.ts` — `validMatchUp`](https://github.com/CourtHive/competition-factory/blob/8c2aaca6801734223ef1e0a8127872344373fbd5/src/validators/validMatchUp.ts). Source paths and aliases are not package import paths.
- **Replacement workflow:** use `tools.matchUps.validMatchUp` (available since 7.33).
- **Test-only adapters:** may exercise this implementation independently of production engine exports; this is not evidence of product use.

## Corrected 7.x reference

Checks the raw matchUp object and returns a boolean. A string `matchUpId` is required; when present, `drawPositions` must have at most two entries convertible to integers (or null/undefined). It does not take `{ matchUp }` or return `{ valid, errors }`.

```js
// Direct governor invocation in 7.x; not a promised standalone 8.x import.
const valid = matchUpGovernor.validMatchUp(matchUp);
```

## Related documentation

- [governors/matchup-governor.md](/docs/governors/matchup-governor)
