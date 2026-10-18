---
title: refreshLadderRatings
---

# refreshLadderRatings

:::warning 8.0.0 engine API transition

This method is a **candidate for removal from production governors and engine exports at 8.0.0**. Its 7.x route has not been removed. Final removal and standalone package-export decisions require the per-method review and external-integrator confirmation described in the [transition index](/docs/implementation/engine-api-transition-8).

:::

## Source-local contract

The declaration below is copied from the pinned source revision; referenced types are defined there. It is an implementation signature, not a package import example.

```text
/**
 * Writes externally-sourced ratings for the participants on a ladder.
 *
 * THE FACTORY DOES NOT FETCH RATINGS. UTR, WTN and DUPR are other people's systems with their own
 * credentials and terms; retrieving values is an operator's job and belongs in an ingest adapter,
 * not in a competition engine. This takes the values it is handed and records them.
 *
 * On an externally-rated ladder the standing holds still between refreshes. Play is NOT blocked
 * meanwhile — a participant awaiting a refresh may challenge and be challenged as normal; only
 * their POSITION is unaffected until new values land, at which point the whole standing re-derives.
 *
 * Participants absent from `ratings` are left exactly as they were rather than cleared: a partial
 * refresh is the normal case, because a provider will not have a value for everyone.
 */
export function refreshLadderRatings(params: RefreshArgs): ResultType & { updated?: number; skipped?: string[] };
```

## Engine effects

**State writes:** not yet assessed. **Notices:** not yet assessed. Governor query/mutate placement is not proof of purity; review the implementation and engine path before deciding exposure.

## Consumer evidence

The refreshed source-name scan found no name mentions in the scanned product source files. This does not establish external-integrator non-use. The manifest records repository revisions and scan exclusions. External-integrator confirmation is pending.

## Availability and ownership

- **Production governor declarations:** `ladderGovernor`.
- **Standalone package API after 8.0.0:** decision pending; this page does not establish a supported import.
- **Implementation:** [`src/mutate/ladder/refreshLadderRatings.ts` — `refreshLadderRatings`](https://github.com/CourtHive/competition-factory/blob/8c2aaca6801734223ef1e0a8127872344373fbd5/src/mutate/ladder/refreshLadderRatings.ts). Source paths and aliases are not package import paths.
- **Replacement workflow:** not yet established; no supported replacement is promised.
- **Test-only adapters:** may exercise this implementation independently of production engine exports; this is not evidence of product use.

## Implementation contract

This candidate had no dedicated governor method section to relocate. Its existing explanations remain at the documentation links below. Consult the linked source for its current signature, state requirements, returns and refusal behavior; this index does not invent a new supported contract.

## Related documentation

- [concepts/draw-types/ladder.md](/docs/concepts/draw-types/ladder)
- [migration-7.0.0.md](/docs/migration-7.0.0)
