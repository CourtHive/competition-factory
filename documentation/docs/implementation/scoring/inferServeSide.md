---
title: inferServeSide
---

# inferServeSide

:::warning 8.0.0 engine API transition

This method is a **candidate for removal from production governors and engine exports at 8.0.0**. Its 7.x route has not been removed. Final removal and standalone package-export decisions require the per-method review and external-integrator confirmation described in the [transition index](/docs/implementation/engine-api-transition-8).

:::

## Source-local contract

The declaration below is copied from the pinned source revision; referenced types are defined there. It is an implementation signature, not a package import example.

```text
/**
 * Infer which court side the serve should come from
 *
 * @param matchUp - Current matchUp state (BEFORE point is added)
 * @param formatStructure - Parsed format structure
 * @param setType - Current set type
 * @returns 'deuce' | 'ad' | undefined (undefined if not inferrable)
 */
export function inferServeSide(
  matchUp: MatchUp,
  formatStructure: FormatStructure,
  setType: SetType,
): 'deuce' | 'ad' | undefined;
```

## Engine effects

**State writes:** no writes found in helper and local helpers. **Notices:** none in helper. Source review: reads score arrays, computes local parity, returns a court side; engine dispatch is positional-incompatible.

## Consumer evidence

The refreshed source-name scan found no name mentions in the scanned product source files. This does not establish external-integrator non-use. The manifest records repository revisions and scan exclusions. External-integrator confirmation is pending.

## Availability and ownership

- **Production governor declarations:** `scoreGovernor`.
- **Standalone package API after 8.0.0:** decision pending; this page does not establish a supported import.
- **Implementation:** [`src/mutate/scoring/serveSideCalculator.ts` — `inferServeSide`](https://github.com/CourtHive/competition-factory/blob/8c2aaca6801734223ef1e0a8127872344373fbd5/src/mutate/scoring/serveSideCalculator.ts). Source paths and aliases are not package import paths.
- **Replacement workflow:** not yet established; no supported replacement is promised.
- **Test-only adapters:** may exercise this implementation independently of production engine exports; this is not evidence of product use.

## Preserved 7.x reference

The passages below preserve the existing governor documentation. **Engine examples describe 7.x availability, not an 8.x replacement.** Source contracts take precedence where an explicitly noted correction applies.

### From governors/score-governor.md

Infers the court side before a point from the matchUp, parsed format and set type. This is a positional implementation function: `inferServeSide(matchUp, formatStructure, setType)`. It returns `deuce`, `ad`, or `undefined` when not inferable. See the source-local contract for format-specific rules. No public direct import is promised by this page.

## Related documentation

- [governors/score-governor.md](/docs/governors/score-governor)
