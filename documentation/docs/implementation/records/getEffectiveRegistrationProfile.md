---
title: getEffectiveRegistrationProfile
---

# getEffectiveRegistrationProfile

:::warning 8.0.0 engine API transition

This method is a **candidate for removal from production governors and engine exports at 8.0.0**. Its 7.x route has not been removed. Final removal and standalone package-export decisions require the per-method review and external-integrator confirmation described in the [transition index](/docs/implementation/engine-api-transition-8).

:::

## Source-local contract

The declaration below is copied from the pinned source revision; referenced types are defined there. It is an implementation signature, not a package import example.

````text
/**
 * The registration facts that actually apply to an event.
 *
 * **The cascade is FIELD BY FIELD, not object by object, and that distinction is the whole reason
 * this function exists.** The obvious implementation —
 *
 * ```ts
 * event.registrationProfile ?? tournamentRecord.registrationProfile
 * ```
 *
 * — is wrong in a way that looks right: an event that overrides only `entriesClose` would silently
 * lose the tournament's `entryUrl`, `entryFees` and every other field, because the whole object was
 * replaced rather than merged. The failure is invisible at the call site and shows up as a missing
 * registration link on one division.
 *
 * So every reader of a registration window must come through here rather than reaching for the
 * fallback themselves. `Event.sanction` documents a similar inheritance, but that field is coarser —
 * a sanction is taken whole — which is exactly why the finer rule is stated and enforced here
 * instead of left to be inferred from the neighbouring one.
 *
 * Only the six overridable fields are returned. The tournament's logistics, sponsors and dress code
 * are not event-scoped concepts and are read from `tournamentRecord.registrationProfile` directly.
 *
 * An `undefined` value on the event does NOT override — absent means "not stated here", never
 * "explicitly nothing". A `null` is preserved, so a producer can still say "this event has no
 * entry URL" when it means it.
 */
export function getEffectiveRegistrationProfile(params: {
  event?: Event;
  tournamentRecord?: Tournament;
}): EffectiveRegistrationProfile;
````

## Engine effects

**State writes:** not yet assessed. **Notices:** not yet assessed. Governor query/mutate placement is not proof of purity; review the implementation and engine path before deciding exposure.

## Consumer evidence

The refreshed source-name scan found no name mentions in the scanned product source files. This does not establish external-integrator non-use. The manifest records repository revisions and scan exclusions. External-integrator confirmation is pending.

## Availability and ownership

- **Production governor declarations:** `entriesGovernor`, `queryGovernor`.
- **Standalone package API after 8.0.0:** decision pending; this page does not establish a supported import.
- **Implementation:** [`src/query/entries/getEffectiveRegistrationProfile.ts` — `getEffectiveRegistrationProfile`](https://github.com/CourtHive/competition-factory/blob/8c2aaca6801734223ef1e0a8127872344373fbd5/src/query/entries/getEffectiveRegistrationProfile.ts). Source paths and aliases are not package import paths.
- **Replacement workflow:** not yet established; no supported replacement is promised.
- **Test-only adapters:** may exercise this implementation independently of production engine exports; this is not evidence of product use.

## Preserved 7.x reference

The passages below preserve the existing governor documentation. **Engine examples describe 7.x availability, not an 8.x replacement.** Source contracts take precedence where an explicitly noted correction applies.

### From governors/entries-governor.md

The registration facts that actually apply to an event, merging the event's `registrationProfile` over the tournament's **field by field**.

```js
const { entriesOpen, entriesClose, withdrawalDeadline, entryFees, entryUrl, eligibilityNotes } =
  engine.getEffectiveRegistrationProfile({ event, tournamentRecord });
```

**The field-by-field cascade is the whole reason this function exists.** The obvious implementation — `event.registrationProfile ?? tournamentRecord.registrationProfile` — is wrong in a way that looks right: an event overriding only `entriesClose` would silently lose the tournament's `entryUrl`, `entryFees` and every other field, because the whole object was replaced rather than merged. The failure is invisible at the call site and shows up as a missing registration link on one division.

Every reader of a registration window should come through here rather than reaching for the fallback itself.

Only the six overridable fields are returned; the tournament's logistics, sponsors and dress code are not event-scoped concepts and are read from `tournamentRecord.registrationProfile` directly. An `undefined` value on the event does **not** override — absent means "not stated here", never "explicitly nothing" — while a `null` is preserved, so a producer can still say "this event has no entry URL" when it means it.

See [Registration Profile](/docs/concepts/registration-profile#event-grain-overrides).

---

## Related documentation

- [concepts/registration-profile.md](/docs/concepts/registration-profile)
- [concepts/tournament-discovery.md](/docs/concepts/tournament-discovery)
- [governors/entries-governor.md](/docs/governors/entries-governor)
- [types/typedefs.mdx](/docs/types/typedefs)
