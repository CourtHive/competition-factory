---
title: getMatchUpsToSchedule
---

# getMatchUpsToSchedule

:::warning 8.0.0 engine API transition

This method is a **candidate for removal from production governors and engine exports at 8.0.0**. Its 7.x route has not been removed. Final removal and standalone package-export decisions require the per-method review and external-integrator confirmation described in the [transition index](/docs/implementation/engine-api-transition-8).

:::

## Source-local contract

The declaration below is copied from the pinned source revision; referenced types are defined there. It is an implementation signature, not a package import example.

```text
export function getMatchUpsToSchedule(params: GetMatchUpsToScheduleArgs): {
  matchUpsToSchedule?: any[];
  error?: ErrorType;
  matchUpMap?: any;
};
```

## Engine effects

**State writes:** not yet assessed. **Notices:** not yet assessed. Governor query/mutate placement is not proof of purity; review the implementation and engine path before deciding exposure.

## Consumer evidence

The refreshed source-name scan found no name mentions in the scanned product source files. This does not establish external-integrator non-use. The manifest records repository revisions and scan exclusions. External-integrator confirmation is pending.

## Availability and ownership

- **Production governor declarations:** `queryGovernor`, `scheduleGovernor`.
- **Standalone package API after 8.0.0:** decision pending; this page does not establish a supported import.
- **Implementation:** [`src/mutate/matchUps/schedule/scheduleMatchUps/getMatchUpsToSchedule.ts` — `getMatchUpsToSchedule`](https://github.com/CourtHive/competition-factory/blob/8c2aaca6801734223ef1e0a8127872344373fbd5/src/mutate/matchUps/schedule/scheduleMatchUps/getMatchUpsToSchedule.ts). Source paths and aliases are not package import paths.
- **Replacement workflow:** not yet established; no supported replacement is promised.
- **Test-only adapters:** may exercise this implementation independently of production engine exports; this is not evidence of product use.

## Corrected 7.x reference

These examples describe the 7.x engine route.

Selects schedulable matchUps from the supplied `matchUps` and `orderedMatchUpIds`, accounting for statuses and existing schedule information. The result key is `matchUpsToSchedule`, with an optional `matchUpMap` and error. Event/draw IDs alone do not supply the ordered candidate list.

```js
const { matchUpsToSchedule, matchUpMap, error } = engine.getMatchUpsToSchedule({
  matchUps,
  orderedMatchUpIds,
});
```

## Related documentation

- [governors/schedule-governor.md](/docs/governors/schedule-governor)
