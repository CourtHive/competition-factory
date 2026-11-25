---
title: getParticipantPoints
---

# getParticipantPoints

:::warning 8.0.0 engine API transition

This method is **scheduled for removal from production governors and engine exports at 8.0.0**. Its 7.x route still works. The removal list was confirmed with external integrators on 2026-10-28 and closed on 2026-11-22. The standalone package-export decision is made per method; see the [transition index](/docs/implementation/engine-api-transition-8).

:::

## Source-local contract

The declaration below is copied from the pinned source revision; referenced types are defined there. It is an implementation signature, not a package import example.

```text
export function getParticipantPoints({ pointAwards, personId, aggregationRules = {} }: GetParticipantPointsArgs): {
  buckets: RankingListBucketBreakdown[];
  totalPoints: number;
};
```

## Engine effects

**State writes:** not yet assessed. **Notices:** not yet assessed. Governor query/mutate placement is not proof of purity; review the implementation and engine path before deciding exposure.

## Consumer evidence

The refreshed source-name scan found no name mentions in the scanned product source files. This does not establish external-integrator non-use. The manifest records repository revisions and scan exclusions. External-integrator review (2026-10-28) found no use, and the removal list was closed on 2026-11-22. A later integrator audit (2026-11-06) found it in use; that call moves to `tools.rankings.getParticipantPoints`.

## Availability and ownership

- **Production governor declarations:** `rankingGovernor`.
- **Standalone package API after 8.0.0:** decision pending; this page does not establish a supported import.
- **Implementation:** [`src/query/scales/getParticipantPoints.ts` — `getParticipantPoints`](https://github.com/CourtHive/competition-factory/blob/8c2aaca6801734223ef1e0a8127872344373fbd5/src/query/scales/getParticipantPoints.ts). Source paths and aliases are not package import paths.
- **Replacement workflow:** use `tools.rankings.getParticipantPoints` (available from 7.49).
- **Test-only adapters:** may exercise this implementation independently of production engine exports; this is not evidence of product use.

## Preserved 7.x reference

The passages below preserve the existing governor documentation. **Engine examples describe 7.x availability, not an 8.x replacement.** Source contracts take precedence where an explicitly noted correction applies.

### From governors/ranking-governor.md

Returns a per-participant breakdown of counting and dropped results.

```js
const { buckets, totalPoints } = rankingGovernor.getParticipantPoints({
  pointAwards: allAwards,
  personId: 'player-abc',
  aggregationRules,
});
```

**Purpose:** Inspect which results count toward a participant's ranking and which are dropped.

---

## Related documentation

- [governors/ranking-governor.md](/docs/governors/ranking-governor)
- [migration-3.0.0.md](/docs/migration-3.0.0)
- [scale-engine/aggregation.md](/docs/scale-engine/aggregation)
- [scale-engine/scale-engine-api.md](/docs/scale-engine/scale-engine-api)
