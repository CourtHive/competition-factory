---
title: addFinishingRounds
---

# addFinishingRounds

:::warning 8.0.0 engine API transition

This method is **scheduled for removal from `drawsGovernor` at 8.0.0**. Its 7.x route still works. It leaves the engines with it. The removal or rename is recorded in the [8.0.0 migration guide](/docs/migration-8.0.0#by-governor). The standalone package-export decision is made per method; see the [transition index](/docs/implementation/engine-api-transition-8).

:::

## Source-local contract

The declaration below is copied from the source revision `c27dd7649e`; referenced types are defined there. It is an implementation signature, not a package import example.

```text
export function addFinishingRounds({
  finishingPositionOffset = 0,
  finishingPositionLimit,
  positionsFed,
  roundsCount,
  roundLimit,
  matchUps,
  lucky,
  fmlc,
}: AddFinishingRoundsArgs): MatchUp[] | ResultType;
```

## Engine effects

**State writes:** not yet assessed. **Notices:** not yet assessed. Governor query/mutate placement is not proof of purity; review the implementation and engine path before deciding exposure.

## Availability and ownership

- **Production governor declarations:** `drawsGovernor`.
- **Standalone package API after 8.0.0:** decision pending; this page does not establish a supported import.
- **Implementation:** [`src/query/structure/addFinishingRounds.ts` — `addFinishingRounds`](https://github.com/CourtHive/competition-factory/blob/c27dd7649e/packages/competition-factory/src/query/structure/addFinishingRounds.ts). Source paths and aliases are not package import paths.
- **Replacement workflow:** not yet established; no supported replacement is promised.

## Related documentation

- [governors/draws-governor.md](/docs/governors/draws-governor)
- [apis/draw-engine-api.md](/docs/apis/draw-engine-api)
