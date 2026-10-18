---
title: getDrawStructures
---

# getDrawStructures

:::warning 8.0.0 engine API transition

This method is a **candidate for removal from production governors and engine exports at 8.0.0**. Its 7.x route has not been removed. Final removal and standalone package-export decisions require the per-method review and external-integrator confirmation described in the [transition index](/docs/implementation/engine-api-transition-8).

:::

## Source-local contract

The declaration below is copied from the pinned source revision; referenced types are defined there. It is an implementation signature, not a package import example.

```text
export function getDrawStructures({
  withStageGrouping,
  drawDefinition,
  stageSequences,
  stageSequence,
  roundTarget,
  sortConfig,
  stages,
  stage,
}: GetDrawStructuresArgs): ResultType & FoundDrawStructure;
```

## Engine effects

**State writes:** not yet assessed. **Notices:** not yet assessed. Governor query/mutate placement is not proof of purity; review the implementation and engine path before deciding exposure.

## Consumer evidence

The refreshed source-name scan found no name mentions in the scanned product source files. This does not establish external-integrator non-use. The manifest records repository revisions and scan exclusions. External-integrator confirmation is pending.

## Availability and ownership

- **Production governor declarations:** `drawsGovernor`, `queryGovernor`.
- **Standalone package API after 8.0.0:** decision pending; this page does not establish a supported import.
- **Implementation:** [`src/acquire/findStructure.ts` — `getDrawStructures`](https://github.com/CourtHive/competition-factory/blob/8c2aaca6801734223ef1e0a8127872344373fbd5/src/acquire/findStructure.ts). Source paths and aliases are not package import paths.
- **Replacement workflow:** not yet established; no supported replacement is promised.
- **Test-only adapters:** may exercise this implementation independently of production engine exports; this is not evidence of product use.

## Preserved 7.x reference

The passages below preserve the existing governor documentation. **Engine examples describe 7.x availability, not an 8.x replacement.** Source contracts take precedence where an explicitly noted correction applies.

### From governors/draws-governor.md

Returns all structures in a draw.

```js
const { structures } = engine.getDrawStructures({
  drawId, // required
  stage, // optional - filter by stage
});
```

**Purpose:** Get draw structure details.

---

## Related documentation

- [apis/draw-engine-api.md](/docs/apis/draw-engine-api)
- [governors/draws-governor.md](/docs/governors/draws-governor)
- [testing/testing-overview.md](/docs/testing/testing-overview)
- [tmx/draws.md](/docs/tmx/draws)
