---
title: validateTieFormat
---

# validateTieFormat

:::warning 8.0.0 engine API transition

This method is a **candidate for removal from production governors and engine exports at 8.0.0**. Its 7.x route has not been removed. Final removal and standalone package-export decisions require the per-method review and external-integrator confirmation described in the [transition index](/docs/implementation/engine-api-transition-8).

:::

## Source-local contract

The declaration below is copied from the pinned source revision; referenced types are defined there. It is an implementation signature, not a package import example.

```text
export function validateTieFormat(params: ValidateTieFormatArgs): ResultType;
```

## Engine effects

**State writes:** not yet assessed. **Notices:** not yet assessed. Governor query/mutate placement is not proof of purity; review the implementation and engine path before deciding exposure.

## Consumer evidence

The refreshed source-name scan found no name mentions in the scanned product source files. This does not establish external-integrator non-use. The manifest records repository revisions and scan exclusions. External-integrator confirmation is pending.

## Availability and ownership

- **Production governor declarations:** `scoreGovernor`.
- **Standalone package API after 8.0.0:** decision pending; this page does not establish a supported import.
- **Implementation:** [`src/validators/validateTieFormat.ts` — `validateTieFormat`](https://github.com/CourtHive/competition-factory/blob/8c2aaca6801734223ef1e0a8127872344373fbd5/src/validators/validateTieFormat.ts). Source paths and aliases are not package import paths.
- **Replacement workflow:** not yet established; no supported replacement is promised.
- **Test-only adapters:** may exercise this implementation independently of production engine exports; this is not evidence of product use.

## Preserved 7.x reference

The passages below preserve the existing governor documentation. **Engine examples describe 7.x availability, not an 8.x replacement.** Source contracts take precedence where an explicitly noted correction applies.

### From governors/score-governor.md

Provides validation for `tieFormat` objects. See [tieFormats](/docs/concepts/tieFormat).

```js
const {
  valid, // boolean whether valid or not
  error,
} = scoreGovernor.validateTieFormat({
  checkCollectionIds, // ensure collectionId is present on all collections
  enforceValues, // optional - refuse negative values and an unreachable valueGoal (save-time rules)
  enforceGender,
  tieFormat,
  gender,
});
```

`enforceValues` applies the rules a tieFormat must meet when it is **saved**: no negative `matchUpValue`,
`collectionValue`, `setValue`, `scoreValue` or line value in `collectionValueProfiles`, and a
`winCriteria.valueGoal` no greater than the total the tie's matchUps are worth (skipped when a collection is
valued by sets or games, whose total is unpredictable). Every path that saves a tieFormat enforces them:
adding it to an event or draw, `modifyTieFormat`, and the collection and collection-group mutations. Scoring
and line-up generation read a stored tieFormat without them, so a record saved before these rules still scores.

---

## Related documentation

- [governors/score-governor.md](/docs/governors/score-governor)
- [governors/tie-format-governor.md](/docs/governors/tie-format-governor)
- [migration-7.0.0.md](/docs/migration-7.0.0)
- [tools/tools-overview.md](/docs/tools/tools-overview)
