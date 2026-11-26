---
title: applyDerivedRankings
---

# applyDerivedRankings

:::warning 8.0.0 engine API transition

This method is **scheduled for removal from `rankingGovernor` at 8.0.0**. Its 7.x route still works. It leaves the engines with it. The removal or rename is recorded in the [8.0.0 migration guide](/docs/migration-8.0.0#by-governor). The standalone package-export decision is made per method; see the [transition index](/docs/implementation/engine-api-transition-8).

:::

## Source-local contract

The declaration below is copied from the source revision `c27dd7649e`; referenced types are defined there. It is an implementation signature, not a package import example.

```text
export function applyDerivedRankings(params?: Partial<ApplyDerivedRankingsArgs>): RankingListEntry[] | ResultType;
```

## Engine effects

**State writes:** not yet assessed. **Notices:** not yet assessed. Governor query/mutate placement is not proof of purity; review the implementation and engine path before deciding exposure.

## Availability and ownership

- **Production governor declarations:** `rankingGovernor`.
- **Standalone package API after 8.0.0:** decision pending; this page does not establish a supported import.
- **Implementation:** [`src/query/scales/applyDerivedRankings.ts` — `applyDerivedRankings`](https://github.com/CourtHive/competition-factory/blob/c27dd7649e/packages/competition-factory/src/query/scales/applyDerivedRankings.ts). Source paths and aliases are not package import paths.
- **Replacement workflow:** use `tools.rankings.deriveRankingList`, the same function under the name of what it does.

## Related documentation

- [governors/ranking-governor.md](/docs/governors/ranking-governor)
