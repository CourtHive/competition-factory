---
title: calculateMatchUpMargin
---

# calculateMatchUpMargin

:::warning 8.0.0 engine API transition

This method is a **candidate for removal from production governors and engine exports at 8.0.0**. Its 7.x route has not been removed. Final removal and standalone package-export decisions require the per-method review and external-integrator confirmation described in the [transition index](/docs/implementation/engine-api-transition-8).

:::

## Source-local contract

The declaration below is copied from the pinned source revision; referenced types are defined there. It is an implementation signature, not a package import example.

```text
/**
 * Calculate the margin of defeat for a completed matchUp.
 *
 * Returns a unified `margin` value between 0 and 1 where:
 * - Values approaching 1 = most competitive (closest match)
 * - Values approaching 0 = most one-sided
 * - NaN = no meaningful score (walkover, default, etc.)
 *
 * The margin is derived from whichever score layer has the most data:
 * - `pointRatio` — from `side1PointScore`/`side2PointScore` (timed/points-based sets)
 * - `gameRatio`  — from `side1Score`/`side2Score` (standard game-based sets)
 * - `setRatio`   — from set win counts (fallback when neither games nor points are available)
 *
 * For lucky draw advancement, higher `margin` means the loser lost by the
 * narrowest margin and should be favored for advancement.
 */
export function calculateMatchUpMargin({ matchUp }: CalculateMatchUpMarginArgs): CalculateMatchUpMarginResult;
```

## Engine effects

**State writes:** not yet assessed. **Notices:** not yet assessed. Governor query/mutate placement is not proof of purity; review the implementation and engine path before deciding exposure.

## Consumer evidence

The refreshed source-name scan found no name mentions in the scanned product source files. This does not establish external-integrator non-use. The manifest records repository revisions and scan exclusions. External-integrator confirmation is pending.

## Availability and ownership

- **Production governor declarations:** `matchUpGovernor`, `queryGovernor`.
- **Standalone package API after 8.0.0:** decision pending; this page does not establish a supported import.
- **Implementation:** [`src/query/matchUp/calculateMatchUpMargin.ts` — `calculateMatchUpMargin`](https://github.com/CourtHive/competition-factory/blob/8c2aaca6801734223ef1e0a8127872344373fbd5/src/query/matchUp/calculateMatchUpMargin.ts). Source paths and aliases are not package import paths.
- **Replacement workflow:** not yet established; no supported replacement is promised.
- **Test-only adapters:** may exercise this implementation independently of production engine exports; this is not evidence of product use.

## Implementation contract

This candidate had no dedicated governor method section to relocate. Its existing explanations remain at the documentation links below. Consult the linked source for its current signature, state requirements, returns and refusal behavior; this index does not invent a new supported contract.

## Related documentation

- [concepts/draw-types/lucky-draw.mdx](/docs/concepts/draw-types/lucky-draw)
- [migration-3.0.0.md](/docs/migration-3.0.0)
