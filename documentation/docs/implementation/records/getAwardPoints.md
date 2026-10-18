---
title: getAwardPoints
---

# getAwardPoints

:::warning 8.0.0 engine API transition

This method is a **candidate for removal from production governors and engine exports at 8.0.0**. Its 7.x route has not been removed. Final removal and standalone package-export decisions require the per-method review and external-integrator confirmation described in the [transition index](/docs/implementation/engine-api-transition-8).

:::

## Source-local contract

The declaration below is copied from the pinned source revision; referenced types are defined there. It is an implementation signature, not a package import example.

```text
export function getAwardPoints({
  participantWon,
  flightNumber,
  valueObj,
  drawSize,
  flights,
  level,
}: GetAwardPointsArgs);
```

## Engine effects

**State writes:** not yet assessed. **Notices:** not yet assessed. Governor query/mutate placement is not proof of purity; review the implementation and engine path before deciding exposure.

## Consumer evidence

The refreshed source-name scan found no name mentions in the scanned product source files. This does not establish external-integrator non-use. The manifest records repository revisions and scan exclusions. External-integrator confirmation is pending.

## Availability and ownership

- **Production governor declarations:** `rankingGovernor`.
- **Standalone package API after 8.0.0:** decision pending; this page does not establish a supported import.
- **Implementation:** [`src/query/scales/getAwardPoints.ts` — `getAwardPoints`](https://github.com/CourtHive/competition-factory/blob/8c2aaca6801734223ef1e0a8127872344373fbd5/src/query/scales/getAwardPoints.ts). Source paths and aliases are not package import paths.
- **Replacement workflow:** not yet established; no supported replacement is promised.
- **Test-only adapters:** may exercise this implementation independently of production engine exports; this is not evidence of product use.

## Preserved 7.x reference

The passages below preserve the existing governor documentation. **Engine examples describe 7.x availability, not an 8.x replacement.** Source contracts take precedence where an explicitly noted correction applies.

### From governors/ranking-governor.md

Resolves a position value object into numeric points. The `accessor` is derived from [`finishingPositionRange`](/docs/concepts/finishing-positions#accessor).

```js
const { awardPoints, requireWin } = rankingGovernor.getAwardPoints({
  valueObj: finishingPositionRanges[accessor],
  level: 3,
  drawSize: 32,
  flightNumber: 1,
});
```

**Purpose:** Handles level-keyed values (`{ level: { 1: 1000, 2: 500 } }`), draw size thresholds (`[{ threshold: 16, value: 800 }]`), flight lookups, and `won`/`lost` accessors.

---

## Related documentation

- [governors/ranking-governor.md](/docs/governors/ranking-governor)
- [scale-engine/scale-engine-api.md](/docs/scale-engine/scale-engine-api)
