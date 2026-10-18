---
title: getEligibleEvents
---

# getEligibleEvents

:::warning 8.0.0 engine API transition

This method is a **candidate for removal from production governors and engine exports at 8.0.0**. Its 7.x route has not been removed. Final removal and standalone package-export decisions require the per-method review and external-integrator confirmation described in the [transition index](/docs/implementation/engine-api-transition-8).

:::

## Source-local contract

The declaration below is copied from the pinned source revision; referenced types are defined there. It is an implementation signature, not a package import example.

```text
/**
 * The same question across many events — "which of these can I enter".
 *
 * The bulk form exists because that is the shape callers actually need; asking per event means a
 * caller re-resolves the participant and the tournament for every one of them.
 *
 * Events that cannot be evaluated at all (no resolvable date range, for instance) are returned as
 * `indeterminate`, never dropped. A silently shortened list is indistinguishable from a list where
 * those events were checked and found ineligible.
 */
export function getEligibleEvents(params: {
  participant: Participant;
  events: Event[];
  tournamentRecord?: Tournament;
}): ResultType & { eventEligibility?: EventEligibility[] };
```

## Engine effects

**State writes:** not yet assessed. **Notices:** not yet assessed. Governor query/mutate placement is not proof of purity; review the implementation and engine path before deciding exposure.

## Consumer evidence

The refreshed source-name scan found no name mentions in the scanned product source files. This does not establish external-integrator non-use. The manifest records repository revisions and scan exclusions. External-integrator confirmation is pending.

## Availability and ownership

- **Production governor declarations:** `eventGovernor`, `queryGovernor`.
- **Standalone package API after 8.0.0:** decision pending; this page does not establish a supported import.
- **Implementation:** [`src/query/entries/getParticipantEligibility.ts` — `getEligibleEvents`](https://github.com/CourtHive/competition-factory/blob/8c2aaca6801734223ef1e0a8127872344373fbd5/src/query/entries/getParticipantEligibility.ts). Source paths and aliases are not package import paths.
- **Replacement workflow:** not yet established; no supported replacement is promised.
- **Test-only adapters:** may exercise this implementation independently of production engine exports; this is not evidence of product use.

## Preserved 7.x reference

The passages below preserve the existing governor documentation. **Engine examples describe 7.x availability, not an 8.x replacement.** Source contracts take precedence where an explicitly noted correction applies.

### From governors/event-governor.md

Which of a set of events a participant may enter. The bulk form of `getParticipantEligibility` — asking per event means re-resolving the participant and the tournament for each one.

```js
const { eventEligibility } = engine.getEligibleEvents({
  participant,
  events, // Event[]
  tournamentRecord, // optional
});
// eventEligibility: [{ eventId, eligible, indeterminate, rejectionReasons }]
```

Events that cannot be evaluated at all — no resolvable date range, for instance — are returned as `indeterminate`, **never dropped**. A silently shortened list is indistinguishable from one where those events were checked and found ineligible.

See [Entry Eligibility](/docs/concepts/events/entry-eligibility).

---

## Related documentation

- [concepts/events/entry-eligibility.md](/docs/concepts/events/entry-eligibility)
- [governors/event-governor.md](/docs/governors/event-governor)
