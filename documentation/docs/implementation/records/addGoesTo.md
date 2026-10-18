---
title: addGoesTo
---

# addGoesTo

:::warning 8.0.0 engine API transition

This method is a **candidate for removal from production governors and engine exports at 8.0.0**. Its 7.x route has not been removed. Final removal and standalone package-export decisions require the per-method review and external-integrator confirmation described in the [transition index](/docs/implementation/engine-api-transition-8).

:::

## Source-local contract

The declaration below is copied from the pinned source revision; referenced types are defined there. It is an implementation signature, not a package import example.

```text
export function addGoesTo({ inContextDrawMatchUps, drawDefinition, matchUpsMap }: AddGoesToArgs): AddGoesToResult;
```

## Engine effects

**State writes:** yes, including stored matchUp progression edges and finishing ranges. **Notices:** none. Observed 2026-10-18 on a sync engine: `engine.addGoesTo({ drawId })` on a draw of 8 with its winner edges stripped restored six of them and raised no `modifyMatchUp` or `modifyDrawDefinition` notice. This query-governor route is not read-only. The write-without-notice behavior is an independent reason to remove this route at 8.0.0; use the supported migration routes below.

## Consumer evidence

The refreshed source-name scan found no name mentions in the scanned product source files. This does not establish external-integrator non-use. The manifest records repository revisions and scan exclusions. External-integrator confirmation is pending.

## Availability and ownership

- **Production governor declarations:** `drawsGovernor`, `queryGovernor`.
- **Standalone package API after 8.0.0:** decision pending; this page does not establish a supported import.
- **Implementation:** [`src/query/matchUps/addGoesTo.ts` — `addGoesTo`](https://github.com/CourtHive/competition-factory/blob/8c2aaca6801734223ef1e0a8127872344373fbd5/src/query/matchUps/addGoesTo.ts). Source paths and aliases are not package import paths.
- **Replacement workflow:** use the supported storage, ingest, draw-addition or read-projection route below.
- **Test-only adapters:** may exercise this implementation independently of production engine exports; this is not evidence of product use.

## Corrected implementation contract

This helper derives progression edges from existing draw links and topology; **it does not create a link between structures**. It accepts `{ drawDefinition, inContextDrawMatchUps?, matchUpsMap? }`, enriches stored and in-context matchUps with `winnerMatchUpId` / `loserMatchUpId`, may widen the loser's finishing range, and returns `{ inContextDrawMatchUps, goesToMap }` or an error. The former example's `sourceStructureId`, `targetStructureId` and `roundNumber` parameters were incorrect.

## Supported migration routes

| Need                                    | Supported route                                                                                                                   |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Persist derived edges                   | `migrateTournamentRecord` (stores the edges itself; reported as `promoted.goesTo`)                                                |
| Provider-key ingest                     | `POST /provider-key/tournaments` migrates records on ingest                                                                       |
| Add a hand-built draw                   | `addDrawDefinition` stores edges                                                                                                  |
| Read a legacy draw without stored edges | `getDrawData`, `getStructureData` and `getEventData` derive onto a copy; flattened matchUps use `readModel.applyProgressionEdges` |

The supporting `storeGoesTo`, `ensureGoesTo`, `drawWithDerivedGoesTo`, `hasStoredGoesTo` and `eventWithDerivedGoesTo` helpers are internal implementations, not standalone package APIs. Do not deep-import them.

## Related documentation

- [concepts/performance.md](/docs/concepts/performance)
- [governors/draws-governor.md](/docs/governors/draws-governor)
- [governors/query-governor.md](/docs/governors/query-governor)
