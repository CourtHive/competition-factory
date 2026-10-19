---
title: allPlayoffPositionsFilled
---

# allPlayoffPositionsFilled

:::warning 8.0.0 engine API transition

This method is a **candidate for removal from production governors and engine exports at 8.0.0**. Its 7.x route has not been removed. Final removal and standalone package-export decisions require the per-method review and external-integrator confirmation described in the [transition index](/docs/implementation/engine-api-transition-8).

:::

## Source-local contract

The declaration below is copied from the pinned source revision; referenced types are defined there. It is an implementation signature, not a package import example.

```text
export function allPlayoffPositionsFilled(params: StructureActionsArgs);
```

## Engine effects

**State writes:** not yet assessed. **Notices:** not yet assessed. Governor query/mutate placement is not proof of purity; review the implementation and engine path before deciding exposure.

## Consumer evidence

The refreshed source-name scan found no name mentions in the scanned product source files. This does not establish external-integrator non-use. The manifest records repository revisions and scan exclusions. External-integrator confirmation is pending.

## Availability and ownership

- **Production governor declarations:** `drawsGovernor`, `queryGovernor`.
- **Standalone package API after 8.0.0:** decision pending; this page does not establish a supported import.
- **Implementation:** [`src/query/drawDefinition/structureActions.ts` — `allPlayoffPositionsFilled`](https://github.com/CourtHive/competition-factory/blob/8c2aaca6801734223ef1e0a8127872344373fbd5/src/query/drawDefinition/structureActions.ts). Source paths and aliases are not package import paths.
- **Replacement workflow:** not yet established; no supported replacement is promised.
- **Test-only adapters:** may exercise this implementation independently of production engine exports; this is not evidence of product use.

## Corrected 7.x reference

These engine examples apply to 7.x, not a promised 8.x replacement.

Checks the existing playoff structures and their position assignments. Returns a boolean for valid draws; a missing draw definition returns an error result. It does not return an `allFilled` property.

```js
const allFilled = engine.allPlayoffPositionsFilled({ drawId, structureId });
```

The former `drawid` spelling was incorrect; the engine context hint is `drawId`.

## Related documentation

- [governors/draws-governor.md](/docs/governors/draws-governor)
- [governors/query-governor.md](/docs/governors/query-governor)
- [migration.md](/docs/migration)
