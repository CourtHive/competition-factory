---
title: getScaleValues
---

# getScaleValues

:::warning 8.0.0 engine API transition

This method is a **candidate for removal from production governors and engine exports at 8.0.0**. Its 7.x route has not been removed. Final removal and standalone package-export decisions require the per-method review and external-integrator confirmation described in the [transition index](/docs/implementation/engine-api-transition-8).

:::

## Source-local contract

The declaration below is copied from the pinned source revision; referenced types are defined there. It is an implementation signature, not a package import example.

```text
export function getScaleValues(params): ResultType & {
  seedings?: ScalesType;
  rankings?: ScalesType;
  ratings?: ScalesType;
};
```

## Engine effects

**State writes:** not yet assessed. **Notices:** not yet assessed. Governor query/mutate placement is not proof of purity; review the implementation and engine path before deciding exposure.

## Consumer evidence

The refreshed source-name scan found no name mentions in the scanned product source files. This does not establish external-integrator non-use. The manifest records repository revisions and scan exclusions. External-integrator confirmation is pending.

## Availability and ownership

- **Production governor declarations:** `participantGovernor`, `queryGovernor`.
- **Standalone package API after 8.0.0:** decision pending; this page does not establish a supported import.
- **Implementation:** [`src/query/participant/getScaleValues.ts` — `getScaleValues`](https://github.com/CourtHive/competition-factory/blob/8c2aaca6801734223ef1e0a8127872344373fbd5/src/query/participant/getScaleValues.ts). Source paths and aliases are not package import paths.
- **Replacement workflow:** not yet established; no supported replacement is promised.
- **Test-only adapters:** may exercise this implementation independently of production engine exports; this is not evidence of product use.

## Preserved 7.x reference

The passages below preserve the existing governor documentation. **Engine examples describe 7.x availability, not an 8.x replacement.** Source contracts take precedence where an explicitly noted correction applies.

### From governors/participant-governor.md

Resolves one participant's scale timeItems into ratings, rankings and seedings.

```js
const { ratings, rankings, seedings } = engine.getScaleValues({
  participant, // required
});
```

Each of `ratings` / `rankings` / `seedings` is keyed by event type
(`SINGLES`, `DOUBLES`, `TEAM`), and **each event type holds an ARRAY** with one
entry per distinct `scaleName` — a participant may hold WTN and UTR at once:

```js
// { scaleName, scaleDate, scaleValue }
const wtn = ratings.SINGLES?.find(({ scaleName }) => scaleName === 'WTN');
const rating = wtn?.scaleValue?.wtnRating;
```

Within a single `scaleName` the entry is the **latest** value, so "current" is
resolved for you. Across scale names nothing is: the set of rating and ranking
scales is open — any number of scales, from any number of bodies, including ones
not yet invented — so the array has no canonical order and never will.

:::warning
**Address entries by `scaleName`, never by index.** `ratings.SINGLES[0]` is the
scale you want only for as long as it is the only one present; the day a second
appears, `[0]` returns a different rating system's number in the same shape and
nothing throws.
:::

**Purpose:** Read a participant's current value for a given scale, with the date
it was recorded.

---

## Related documentation

- [governors/participant-governor.md](/docs/governors/participant-governor)
- [policies/participantPolicy.md](/docs/policies/participantPolicy)
- [tools/tools-overview.md](/docs/tools/tools-overview)
