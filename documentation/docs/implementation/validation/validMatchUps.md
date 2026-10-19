---
title: validMatchUps
---

# validMatchUps

:::warning 8.0.0 engine API transition

This method is a **candidate for removal from production governors and engine exports at 8.0.0**. Its 7.x route has not been removed. Final removal and standalone package-export decisions require the per-method review and external-integrator confirmation described in the [transition index](/docs/implementation/engine-api-transition-8).

:::

## Source-local contract

The declaration below is copied from the pinned source revision; referenced types are defined there. It is an implementation signature, not a package import example.

```text
export function validMatchUps(matchUps);
```

## Engine effects

**State writes:** not yet assessed. **Notices:** not yet assessed. Governor query/mutate placement is not proof of purity; review the implementation and engine path before deciding exposure.

## Consumer evidence

The refreshed source-name scan found no name mentions in the scanned product source files. This does not establish external-integrator non-use. The manifest records repository revisions and scan exclusions. External-integrator confirmation is pending.

## Availability and ownership

- **Production governor declarations:** `matchUpGovernor`, `queryGovernor`.
- **Standalone package API after 8.0.0:** decision pending; this page does not establish a supported import.
- **Implementation:** [`src/validators/validMatchUp.ts` — `validMatchUps`](https://github.com/CourtHive/competition-factory/blob/8c2aaca6801734223ef1e0a8127872344373fbd5/src/validators/validMatchUp.ts). Source paths and aliases are not package import paths.
- **Replacement workflow:** not yet established; no supported replacement is promised.
- **Test-only adapters:** may exercise this implementation independently of production engine exports; this is not evidence of product use.

## Corrected 7.x reference

Checks that the supplied value is an array and every member passes `validMatchUp`. Returns a boolean, not `{ valid, errors }`. An empty array passes this shape check.

```js
// Pass the array directly to the 7.x governor function.
const valid = matchUpGovernor.validMatchUps(matchUps);
```

The raw array signature should not be replaced by an engine-shaped `{ matchUps }` object.

## Related documentation

- [governors/matchup-governor.md](/docs/governors/matchup-governor)
