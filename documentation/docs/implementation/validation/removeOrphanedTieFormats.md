---
title: removeOrphanedTieFormats
---

# removeOrphanedTieFormats

:::warning 8.0.0 engine API transition

This method is a **candidate for removal from production governors and engine exports at 8.0.0**. Its 7.x route has not been removed. Final removal and standalone package-export decisions require the per-method review and external-integrator confirmation described in the [transition index](/docs/implementation/engine-api-transition-8).

:::

## Source-local contract

The declaration below is copied from the pinned source revision; referenced types are defined there. It is an implementation signature, not a package import example.

```text
/**
 * Removes entries from event.tieFormats[] that are no longer referenced
 * by any object in the event hierarchy.
 */
export function removeOrphanedTieFormats({ event }: { event: Event });
```

## Engine effects

**State writes:** not yet assessed. **Notices:** not yet assessed. Governor query/mutate placement is not proof of purity; review the implementation and engine path before deciding exposure.

## Consumer evidence

The refreshed source-name scan found no name mentions in the scanned product source files. This does not establish external-integrator non-use. The manifest records repository revisions and scan exclusions. External-integrator confirmation is pending.

## Availability and ownership

- **Production governor declarations:** `tieFormatGovernor`.
- **Standalone package API after 8.0.0:** decision pending; this page does not establish a supported import.
- **Implementation:** [`src/mutate/tieFormat/writeTieFormat.ts` — `removeOrphanedTieFormats`](https://github.com/CourtHive/competition-factory/blob/8c2aaca6801734223ef1e0a8127872344373fbd5/src/mutate/tieFormat/writeTieFormat.ts). Source paths and aliases are not package import paths.
- **Replacement workflow:** not yet established; no supported replacement is promised.
- **Test-only adapters:** may exercise this implementation independently of production engine exports; this is not evidence of product use.

## Preserved 7.x reference

The passages below preserve the existing governor documentation. **Engine examples describe 7.x availability, not an 8.x replacement.** Source contracts take precedence where an explicitly noted correction applies.

### From governors/tie-format-governor.md

Removes entries from `event.tieFormats[]` that are no longer referenced by any drawDefinition, structure, or matchUp in the event.

```js
engine.removeOrphanedTieFormats({ eventId });
```

**Purpose:** After resetting or removing tieFormats from individual matchUps or structures, centralised entries may become orphaned. This method scans the event hierarchy for all `tieFormatId` references and removes any `event.tieFormats[]` entries that no longer have references.

**When to use:**

- After calling `resetTieFormat` on matchUps
- After bulk removal of structures or matchUps
- As a cleanup step after tieFormat modifications
- Periodically to keep tournament records lean

**Notes:**

- Scans event, drawDefinitions, structures, and TEAM matchUps for `tieFormatId` references
- Removes the `tieFormats` array entirely if no entries remain
- Safe to run multiple times (idempotent)

---

## Related documentation

- [governors/tie-format-governor.md](/docs/governors/tie-format-governor)
