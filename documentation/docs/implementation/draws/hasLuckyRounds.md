---
title: hasLuckyRounds
---

# hasLuckyRounds

:::warning 8.0.0 engine API transition

This method is a **candidate for removal from production governors and engine exports at 8.0.0**. Its 7.x route has not been removed. Final removal and standalone package-export decisions require the per-method review and external-integrator confirmation described in the [transition index](/docs/implementation/engine-api-transition-8).

:::

## Source-local contract

The declaration below is copied from the pinned source revision; referenced types are defined there. It is an implementation signature, not a package import example.

```text
/**
 * Detect whether a structure contains "lucky rounds" — rounds where the matchUp count
 * transitions from odd to even, meaning one participant advances without playing.
 * This is the definitive test for a lucky-style structure, regardless of stage.
 */
export function hasLuckyRounds({ structure, matchUps }: { structure?: Structure; matchUps?: MatchUp[] });
```

## Engine effects

**State writes:** not yet assessed. **Notices:** not yet assessed. Governor query/mutate placement is not proof of purity; review the implementation and engine path before deciding exposure.

## Consumer evidence

The refreshed source-name scan found no name mentions in the scanned product source files. This does not establish external-integrator non-use. The manifest records repository revisions and scan exclusions. External-integrator confirmation is pending.

## Availability and ownership

- **Production governor declarations:** `drawsGovernor`, `queryGovernor`.
- **Standalone package API after 8.0.0:** decision pending; this page does not establish a supported import.
- **Implementation:** [`src/query/drawDefinition/isLucky.ts` — `hasLuckyRounds`](https://github.com/CourtHive/competition-factory/blob/8c2aaca6801734223ef1e0a8127872344373fbd5/src/query/drawDefinition/isLucky.ts). Source paths and aliases are not package import paths.
- **Replacement workflow:** not yet established; no supported replacement is promised.
- **Test-only adapters:** may exercise this implementation independently of production engine exports; this is not evidence of product use.

## Preserved 7.x reference

The passages below preserve the existing governor documentation. **Engine examples describe 7.x availability, not an 8.x replacement.** Source contracts take precedence where an explicitly noted correction applies.

### From governors/draws-governor.md

Determines whether a structure contains "lucky rounds" — rounds where the matchUp count transitions from odd to even, meaning one participant advances without playing. This is the definitive structural test for lucky-style draws, independent of `drawType` or `stage`.

```js
const result = engine.hasLuckyRounds({
  structure, // optional — structure object with matchUps
  matchUps, // optional — array of matchUps (alternative to structure)
});
// returns boolean
```

A lucky round is identified when round _N_ has an **odd** matchUp count and round _N+1_ has an **even** count. Qualifying structures with non-power-of-2 draw sizes are correctly identified as non-lucky because their round transitions don't follow this pattern.

---

## Related documentation

- [concepts/draw-types/lucky-draw.mdx](/docs/concepts/draw-types/lucky-draw)
- [governors/draws-governor.md](/docs/governors/draws-governor)
