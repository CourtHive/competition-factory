---
title: getDrawTypeCoercion
---

# getDrawTypeCoercion

:::warning 8.0.0 engine API transition

This method is **scheduled for removal from production governors and engine exports at 8.0.0**. Its 7.x route still works. The removal list was confirmed with external integrators on 2026-10-28 and closed on 2026-11-22. The standalone package-export decision is made per method; see the [transition index](/docs/implementation/engine-api-transition-8).

:::

## Source-local contract

The declaration below is copied from the pinned source revision; referenced types are defined there. It is an implementation signature, not a package import example.

```text
export function getDrawTypeCoercion({ policyDefinitions, appliedPolicies, drawType }: getDrawTypeCoercionArgs);
```

## Engine effects

**State writes:** not yet assessed. **Notices:** not yet assessed. Governor query/mutate placement is not proof of purity; review the implementation and engine path before deciding exposure.

## Consumer evidence

The refreshed source-name scan found no name mentions in the scanned product source files. This does not establish external-integrator non-use. The manifest records repository revisions and scan exclusions. External-integrator review (2026-10-28) found no use, and the removal list was closed on 2026-11-22.

## Availability and ownership

- **Production governor declarations:** `drawsGovernor`, `queryGovernor`.
- **Standalone package API after 8.0.0:** decision pending; this page does not establish a supported import.
- **Implementation:** [`src/assemblies/generators/drawDefinitions/getDrawTypeCoercion.ts` — `getDrawTypeCoercion`](https://github.com/CourtHive/competition-factory/blob/8c2aaca6801734223ef1e0a8127872344373fbd5/src/assemblies/generators/drawDefinitions/getDrawTypeCoercion.ts). Source paths and aliases are not package import paths.
- **Replacement workflow:** use `tools.draws.getDrawTypeCoercion`, the same function (available from 7.49).
- **Test-only adapters:** may exercise this implementation independently of production engine exports; this is not evidence of product use.

## Corrected 7.x reference

These engine examples apply to 7.x, not a promised 8.x replacement.

Resolves the draw-type coercion policy. Explicit policy definitions take precedence over applied policies, followed by the default `true`. Returns the policy value directly; it does not return `{ valid, targetDrawType }` and does not accept `drawSize`.

```js
const drawTypeCoercion = engine.getDrawTypeCoercion({
  policyDefinitions,
  appliedPolicies,
  drawType,
});
```

## Related documentation

- [governors/draws-governor.md](/docs/governors/draws-governor)
