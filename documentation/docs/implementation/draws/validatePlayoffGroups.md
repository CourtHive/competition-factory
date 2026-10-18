---
title: validatePlayoffGroups
---

# validatePlayoffGroups

:::warning 8.0.0 engine API transition

This method is a **candidate for removal from production governors and engine exports at 8.0.0**. Its 7.x route has not been removed. Final removal and standalone package-export decisions require the per-method review and external-integrator confirmation described in the [transition index](/docs/implementation/engine-api-transition-8).

:::

## Source-local contract

The declaration below is copied from the pinned source revision; referenced types are defined there. It is an implementation signature, not a package import example.

```text
/**
 * Validates playoffGroups configuration, including bestOf consumption tracking.
 *
 * Rules:
 * 1. Each playoffGroup must have a non-empty finishingPositions array
 * 2. finishingPositions values must be in range [1, groupSize]
 * 3. If bestOf is specified:
 *    a. bestOf must be >= groupCount * finishingPositions.length (can't request fewer than guaranteed)
 *    b. bestOf must be <= groupCount * groupSize (can't request more than total participants)
 *    c. bestOf must be > 0
 * 4. Cross-group consumption: after accounting for all bestOf claims on partially-consumed
 *    finishing positions, no standard (non-bestOf) playoff group should end up with
 *    fewer than 2 participants
 * 5. Total participants claimed across all playoff groups cannot exceed groupCount * groupSize
 */
export function validatePlayoffGroups({
  playoffGroups,
  groupCount,
  groupSize,
}: ValidatePlayoffGroupsArgs): ResultType & {
  valid?: boolean;
  consumptionMap?: { [finishingPosition: number]: number };
  info?: string;
};
```

## Engine effects

**State writes:** not yet assessed. **Notices:** not yet assessed. Governor query/mutate placement is not proof of purity; review the implementation and engine path before deciding exposure.

## Consumer evidence

The refreshed source-name scan found no name mentions in the scanned product source files. This does not establish external-integrator non-use. The manifest records repository revisions and scan exclusions. External-integrator confirmation is pending.

## Availability and ownership

- **Production governor declarations:** `drawsGovernor`, `queryGovernor`.
- **Standalone package API after 8.0.0:** decision pending; this page does not establish a supported import.
- **Implementation:** [`src/validators/validatePlayoffGroups.ts` — `validatePlayoffGroups`](https://github.com/CourtHive/competition-factory/blob/8c2aaca6801734223ef1e0a8127872344373fbd5/src/validators/validatePlayoffGroups.ts). Source paths and aliases are not package import paths.
- **Replacement workflow:** not yet established; no supported replacement is promised.
- **Test-only adapters:** may exercise this implementation independently of production engine exports; this is not evidence of product use.

## Implementation contract

This candidate had no dedicated governor method section to relocate. Its existing explanations remain at the documentation links below. Consult the linked source for its current signature, state requirements, returns and refusal behavior; this index does not invent a new supported contract.

## Related documentation

- [concepts/draw-types/round-robin-with-playoff.mdx](/docs/concepts/draw-types/round-robin-with-playoff)
