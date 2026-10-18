---
title: getEventInconsistencies
---

# getEventInconsistencies

:::warning 8.0.0 engine API transition

This method is a **candidate for removal from production governors and engine exports at 8.0.0**. Its 7.x route has not been removed. Final removal and standalone package-export decisions require the per-method review and external-integrator confirmation described in the [transition index](/docs/implementation/engine-api-transition-8).

:::

## Source-local contract

The declaration below is copied from the pinned source revision; referenced types are defined there. It is an implementation signature, not a package import example.

```text
export function getEventInconsistencies(
  params: GetEventInconsistenciesArgs,
): ResultType & { valid?: boolean; inconsistencies?: Inconsistency[] };
```

## Engine effects

**State writes:** not yet assessed. **Notices:** not yet assessed. Governor query/mutate placement is not proof of purity; review the implementation and engine path before deciding exposure.

## Consumer evidence

The refreshed source-name scan found no name mentions in the scanned product source files. This does not establish external-integrator non-use. The manifest records repository revisions and scan exclusions. External-integrator confirmation is pending.

## Availability and ownership

- **Production governor declarations:** `eventGovernor`, `queryGovernor`.
- **Standalone package API after 8.0.0:** decision pending; this page does not establish a supported import.
- **Implementation:** [`src/query/event/getEventInconsistencies.ts` — `getEventInconsistencies`](https://github.com/CourtHive/competition-factory/blob/8c2aaca6801734223ef1e0a8127872344373fbd5/src/query/event/getEventInconsistencies.ts). Source paths and aliases are not package import paths.
- **Replacement workflow:** not yet established; no supported replacement is promised.
- **Test-only adapters:** may exercise this implementation independently of production engine exports; this is not evidence of product use.

## Preserved 7.x reference

The passages below preserve the existing governor documentation. **Engine examples describe 7.x availability, not an 8.x replacement.** Source contracts take precedence where an explicitly noted correction applies.

### From governors/query-governor.md

The **event** layer. Fans out to `getDrawInconsistencies` for every `drawDefinition` (stamping
`eventId`) and adds the check only visible at the event level: whether the participantTypes actually
assigned in the event's draws are consistent with the event's `eventType`.

```js
const { valid, inconsistencies } = engine.getEventInconsistencies({ eventId });
```

- `EVENT_PARTICIPANT_TYPE_MISMATCH` — a participant whose `participantType` is inconsistent with the
  `eventType` is assigned in one of the event's draws (a `DOUBLES` event carrying an `INDIVIDUAL`
  participant, a `SINGLES` event carrying a `PAIR`, etc.). `HYBRID` events legitimately carry both
  `INDIVIDUAL` and `PAIR`. Reads stored `positionAssignments` and resolves each participant's type
  via the participant map. (error)

> The expected participantType is derived by the shared `expectedParticipantType(eventType)` helper —
> the same single source of truth `checkValidEntries` uses for entry validation. Entries-vs-placed
> drift and gender/category eligibility are deferred to a later sub-phase.

## Related documentation

- [governors/query-governor.md](/docs/governors/query-governor)
- [migration-6.0.0.md](/docs/migration-6.0.0)
- [whats-new-6.0.0.md](/docs/whats-new-6.0.0)
