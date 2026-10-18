---
title: isTournamentPublished
---

# isTournamentPublished

:::warning 8.0.0 engine API transition

This method is a **candidate for removal from production governors and engine exports at 8.0.0**. Its 7.x route has not been removed. Final removal and standalone package-export decisions require the per-method review and external-integrator confirmation described in the [transition index](/docs/implementation/engine-api-transition-8).

:::

## Source-local contract

The declaration below is copied from the pinned source revision; referenced types are defined there. It is an implementation signature, not a package import example.

```text
/**
 * Whether a tournament is published — the ONE definition of the tournament-level roll-up.
 *
 * True when any event has a published draw, or the order of play is published, or the participant
 * list is published: `getPublishState(...).publishState.tournament.status.published`.
 *
 * Read this rather than re-deriving the condition. Two partial restatements of it existed — the read
 * model's `tournamentRow` counted only order of play and participants, so a tournament whose only
 * published component was a draw was public on the provider calendar and unpublished in the read
 * model. A missing or unreadable record is unpublished: withholding is the safe default.
 */
export function isTournamentPublished(tournamentRecord: any): boolean;
```

## Engine effects

**State writes:** not yet assessed. **Notices:** not yet assessed. Governor query/mutate placement is not proof of purity; review the implementation and engine path before deciding exposure.

## Consumer evidence

The refreshed source-name scan found no name mentions in the scanned product source files. This does not establish external-integrator non-use. The manifest records repository revisions and scan exclusions. External-integrator confirmation is pending.

## Availability and ownership

- **Production governor declarations:** `publishingGovernor`, `queryGovernor`.
- **Standalone package API after 8.0.0:** decision pending; this page does not establish a supported import.
- **Implementation:** [`src/query/publishing/isTournamentPublished.ts` — `isTournamentPublished`](https://github.com/CourtHive/competition-factory/blob/8c2aaca6801734223ef1e0a8127872344373fbd5/src/query/publishing/isTournamentPublished.ts). Source paths and aliases are not package import paths.
- **Replacement workflow:** not yet established; no supported replacement is promised.
- **Test-only adapters:** may exercise this implementation independently of production engine exports; this is not evidence of product use.

## Implementation contract

This candidate had no dedicated governor method section to relocate. Its existing explanations remain at the documentation links below. Consult the linked source for its current signature, state requirements, returns and refusal behavior; this index does not invent a new supported contract.

## Related documentation

- [governors/publishing-governor.md](/docs/governors/publishing-governor)
