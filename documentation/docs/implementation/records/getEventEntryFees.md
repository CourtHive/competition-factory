---
title: getEventEntryFees
---

# getEventEntryFees

:::warning 8.0.0 engine API transition

This method is a **candidate for removal from production governors and engine exports at 8.0.0**. Its 7.x route has not been removed. Final removal and standalone package-export decisions require the per-method review and external-integrator confirmation described in the [transition index](/docs/implementation/engine-api-transition-8).

:::

## Source-local contract

The declaration below is copied from the pinned source revision; referenced types are defined there. It is an implementation signature, not a package import example.

```text
/**
 * Entry fees that apply to an event, narrowed by the fee's own selectors.
 *
 * A tournament-grain fee list can carry entries for several events, so "the fees on this record" is
 * not the same question as "the fees for this event". Selectors are matched most-specific first:
 * `eventId` > `category` > `eventType`. A fee with NO selector applies to every event — that is how
 * a single tournament-wide price is stated.
 *
 * Returns only the most specific tier that matched, rather than everything that matched: a fee
 * keyed to this exact `eventId` supersedes a blanket "all doubles" price, and returning both would
 * leave the caller to re-derive precedence and get it wrong.
 */
export function getEventEntryFees(params: { event?: Event; tournamentRecord?: Tournament });
```

## Engine effects

**State writes:** not yet assessed. **Notices:** not yet assessed. Governor query/mutate placement is not proof of purity; review the implementation and engine path before deciding exposure.

## Consumer evidence

The refreshed source-name scan found no name mentions in the scanned product source files. This does not establish external-integrator non-use. The manifest records repository revisions and scan exclusions. External-integrator confirmation is pending.

## Availability and ownership

- **Production governor declarations:** `entriesGovernor`, `queryGovernor`.
- **Standalone package API after 8.0.0:** decision pending; this page does not establish a supported import.
- **Implementation:** [`src/query/entries/getEffectiveRegistrationProfile.ts` — `getEventEntryFees`](https://github.com/CourtHive/competition-factory/blob/8c2aaca6801734223ef1e0a8127872344373fbd5/src/query/entries/getEffectiveRegistrationProfile.ts). Source paths and aliases are not package import paths.
- **Replacement workflow:** not yet established; no supported replacement is promised.
- **Test-only adapters:** may exercise this implementation independently of production engine exports; this is not evidence of product use.

## Preserved 7.x reference

The passages below preserve the existing governor documentation. **Engine examples describe 7.x availability, not an 8.x replacement.** Source contracts take precedence where an explicitly noted correction applies.

### From governors/entries-governor.md

The entry fees that apply to an event, narrowed by each fee's own selectors.

```js
const fees = engine.getEventEntryFees({ event, tournamentRecord });
```

A tournament-grain fee list can carry entries for several events, so "the fees on this record" is not the same question as "the fees for this event". Selectors are matched **most-specific first**: `eventId` > `category` > `eventType`. A fee with **no** selector applies to every event — that is how a single tournament-wide price is stated.

Only the most specific tier that matched is returned, rather than everything that matched: a fee keyed to this exact `eventId` supersedes a blanket "all doubles" price, and returning both would leave the caller to re-derive precedence and get it wrong. Fees selecting a _different_ event are excluded rather than returned as a fallback.

---

## Related documentation

- [concepts/registration-profile.md](/docs/concepts/registration-profile)
- [governors/entries-governor.md](/docs/governors/entries-governor)
