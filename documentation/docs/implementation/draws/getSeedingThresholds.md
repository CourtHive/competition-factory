---
title: getSeedingThresholds
---

# getSeedingThresholds

:::warning 8.0.0 engine API transition

This method is **retained on its production governors and engine exports at 8.0.0**: an external integrator confirmed on 2026-10-28 that it calls this method. See the [transition index](/docs/implementation/engine-api-transition-8).

:::

## Source-local contract

The declaration below is copied from the pinned source revision; referenced types are defined there. It is an implementation signature, not a package import example.

```text
export function getSeedingThresholds({
  roundRobinGroupsCount,
  participantsCount,
}: GetSeedingThresholdsArgs): ResultType & {
  seedingThresholds?: number[];
  success?: boolean;
};
```

## Engine effects

**State writes:** not yet assessed. **Notices:** not yet assessed. Governor query/mutate placement is not proof of purity; review the implementation and engine path before deciding exposure.

## Consumer evidence

The refreshed source-name scan found no name mentions in the scanned product source files. This does not establish external-integrator non-use. The manifest records repository revisions and scan exclusions. An external integrator confirmed use on 2026-10-28, so the method stays on its governors.

## Availability and ownership

- **Production governor declarations:** `drawsGovernor`, `queryGovernor`.
- **Standalone package API after 8.0.0:** decision pending; this page does not establish a supported import.
- **Implementation:** [`src/query/drawDefinition/getSeedBlocks.ts` — `getSeedingThresholds`](https://github.com/CourtHive/competition-factory/blob/8c2aaca6801734223ef1e0a8127872344373fbd5/src/query/drawDefinition/getSeedBlocks.ts). Source paths and aliases are not package import paths.
- **Replacement workflow:** none needed; the engine route is retained. The same function is also `tools.draws.getSeedingThresholds` (from 7.49).
- **Test-only adapters:** may exercise this implementation independently of production engine exports; this is not evidence of product use.

## Corrected 7.x reference

These engine examples apply to 7.x, not a promised 8.x replacement.

Calculates seeding thresholds from `participantsCount` and optional `roundRobinGroupsCount`. Returns `{ success, seedingThresholds }` on success; an incompatible round-robin group count returns `INVALID_VALUES`. The old `drawSize` / `policyDefinitions` arguments and `thresholds` result name were incorrect.

```js
const { seedingThresholds, error } = engine.getSeedingThresholds({
  participantsCount,
  roundRobinGroupsCount,
});
```

## Related documentation

- [governors/draws-governor.md](/docs/governors/draws-governor)
- [governors/query-governor.md](/docs/governors/query-governor)
- [migration.md](/docs/migration)
