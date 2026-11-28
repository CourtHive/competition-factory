---
title: dateAvailabilityToBlocks
---

# dateAvailabilityToBlocks

:::warning 8.0.0 engine API transition

This method is **scheduled for removal from production governors and engine exports at 8.0.0**. Its 7.x route still works. The removal list was confirmed with external integrators on 2026-10-28 and closed on 2026-11-22. The standalone package-export decision is made per method; see the [transition index](/docs/implementation/engine-api-transition-8).

:::

Renamed from `todsAvailabilityToBlocks` in 8.0.0, with no alias. Its parameter type `TodsVenue` is now
`AvailabilityVenue`, whose courts are `AvailabilityCourt` (formerly `TodsCourt`). The pinned implementation link
below predates the rename and shows the old names.

## Source-local contract

The declaration below is copied from the pinned source revision; referenced types are defined there. It is an implementation signature, not a package import example.

```text
/**
 * Convert TODS dateAvailability to engine blocks.
 * Useful for initializing engine from existing tournament data.
 *
 * @param venue - TODS venue with dateAvailability
 * @param tournamentId - Tournament ID for block references
 * @returns Array of blocks representing availability
 */
export function dateAvailabilityToBlocks(params: {
  venue: AvailabilityVenue;
  tournamentId: string;
  blockType?: BlockType;
}): Array<{
  court: CourtRef;
  start: string;
  end: string;
  type: BlockType;
}>;
```

## Engine effects

**State writes:** not yet assessed. **Notices:** not yet assessed. Governor query/mutate placement is not proof of purity; review the implementation and engine path before deciding exposure.

## Consumer evidence

The refreshed source-name scan found no name mentions in the scanned product source files. This does not establish external-integrator non-use. The manifest records repository revisions and scan exclusions. External-integrator review (2026-10-28) found no use, and the removal list was closed on 2026-11-22.

## Availability and ownership

- **Production governor declarations:** `availabilityGovernor`.
- **Standalone package API after 8.0.0:** decision pending; this page does not establish a supported import.
- **Implementation:** [`src/assemblies/governors/availabilityGovernor/bridge.ts` — `dateAvailabilityToBlocks`](https://github.com/CourtHive/competition-factory/blob/8c2aaca6801734223ef1e0a8127872344373fbd5/src/assemblies/governors/availabilityGovernor/bridge.ts). Source paths and aliases are not package import paths.
- **Replacement workflow:** not yet established; no supported replacement is promised.
- **Test-only adapters:** may exercise this implementation independently of production engine exports; this is not evidence of product use.

## Implementation contract

This candidate had no dedicated governor method section to relocate. Its existing explanations remain at the documentation links below. Consult the linked source for its current signature, state requirements, returns and refusal behavior; this index does not invent a new supported contract.

## Related documentation

- [availability-engine/block-types-and-algorithms.md](/docs/availability-engine/block-types-and-algorithms)
