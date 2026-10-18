---
title: participantScheduledMatchUps
---

# participantScheduledMatchUps

:::warning 8.0.0 engine API transition

This method is a **candidate for removal from production governors and engine exports at 8.0.0**. Its 7.x route has not been removed. Final removal and standalone package-export decisions require the per-method review and external-integrator confirmation described in the [transition index](/docs/implementation/engine-api-transition-8).

:::

## Source-local contract

The declaration below is copied from the pinned source revision; referenced types are defined there. It is an implementation signature, not a package import example.

```text
export function participantScheduledMatchUps({
  scheduleAttributes = ['scheduledDate', 'scheduledTime'],
  matchUps = [],
}: ParticiapntScheduledMatchUps);
```

## Engine effects

**State writes:** not yet assessed. **Notices:** not yet assessed. Governor query/mutate placement is not proof of purity; review the implementation and engine path before deciding exposure.

## Consumer evidence

The refreshed source-name scan found no name mentions in the scanned product source files. This does not establish external-integrator non-use. The manifest records repository revisions and scan exclusions. External-integrator confirmation is pending.

## Availability and ownership

- **Production governor declarations:** `matchUpGovernor`, `queryGovernor`.
- **Standalone package API after 8.0.0:** decision pending; this page does not establish a supported import.
- **Implementation:** [`src/query/matchUps/participantScheduledMatchUps.ts` — `participantScheduledMatchUps`](https://github.com/CourtHive/competition-factory/blob/8c2aaca6801734223ef1e0a8127872344373fbd5/src/query/matchUps/participantScheduledMatchUps.ts). Source paths and aliases are not package import paths.
- **Replacement workflow:** not yet established; no supported replacement is promised.
- **Test-only adapters:** may exercise this implementation independently of production engine exports; this is not evidence of product use.

## Corrected 7.x reference

These engine examples apply to 7.x, not a promised 8.x replacement.

Groups the supplied matchUps by scheduled date and sorts each group by scheduled time. The caller supplies the relevant participant's matchUps; this helper does not resolve a `participantId` or filter by `scheduleDate`. The result key is `scheduledMatchUps`.

```js
const scheduledResult = engine.participantScheduledMatchUps({
  matchUps,
  scheduleAttributes: ['scheduledDate', 'scheduledTime'],
});
```

Invalid matchUps return `MISSING_MATCHUPS`; invalid schedule attributes return `INVALID_VALUES`.

## Related documentation

- [governors/matchup-governor.md](/docs/governors/matchup-governor)
