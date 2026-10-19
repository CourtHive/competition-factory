---
title: resolveEntryFee
---

# resolveEntryFee

:::warning 8.0.0 engine API transition

This method is a **candidate for removal from production governors and engine exports at 8.0.0**. Its 7.x route has not been removed. Final removal and standalone package-export decisions require the per-method review and external-integrator confirmation described in the [transition index](/docs/implementation/engine-api-transition-8).

:::

## Source-local contract

The declaration below is copied from the pinned source revision; referenced types are defined there. It is an implementation signature, not a package import example.

```text
/**
 * Read a stored entry fee, refusing to guess its scale.
 *
 * `unit` is required on {@link RegistrationEntryFee} by construction, but records written before it
 * existed still arrive over the wire without one, and a stored record is not a compile-time object.
 * This is the read-side counterpart to that requirement: writes are strict, reads are tolerant, and
 * the tolerance takes the shape of an explicit "cannot tell" rather than an assumption.
 *
 * **The unit is never inferred from magnitude.** "6000 is obviously minor units" is wrong on a real
 * ¥6000 entry and on a genuine $6,000 pro-am, and both exist. A consumer that receives
 * `indeterminate` should render "fee on request" or similar — anything but a figure that might be
 * out by 100×.
 *
 * The same reasoning as `sumAgainstBound` in `comparePrizeMoney`: a reader that cannot evaluate must
 * say so, because a confident wrong number is worse than an admitted gap.
 */
export function resolveEntryFee(fee?: RegistrationEntryFee | null): ResolvedEntryFee | IndeterminateEntryFee;
```

## Engine effects

**State writes:** not yet assessed. **Notices:** not yet assessed. Governor query/mutate placement is not proof of purity; review the implementation and engine path before deciding exposure.

## Consumer evidence

The refreshed source-name scan found no name mentions in the scanned product source files. This does not establish external-integrator non-use. The manifest records repository revisions and scan exclusions. External-integrator confirmation is pending.

## Availability and ownership

- **Production governor declarations:** `entriesGovernor`, `queryGovernor`.
- **Standalone package API after 8.0.0:** decision pending; this page does not establish a supported import.
- **Implementation:** [`src/query/entries/resolveEntryFee.ts` — `resolveEntryFee`](https://github.com/CourtHive/competition-factory/blob/8c2aaca6801734223ef1e0a8127872344373fbd5/src/query/entries/resolveEntryFee.ts). Source paths and aliases are not package import paths.
- **Replacement workflow:** not yet established; no supported replacement is promised.
- **Test-only adapters:** may exercise this implementation independently of production engine exports; this is not evidence of product use.

## Preserved 7.x reference

The passages below preserve the existing governor documentation. **Engine examples describe 7.x availability, not an 8.x replacement.** Source contracts take precedence where an explicitly noted correction applies.

### From governors/entries-governor.md

These are direct governor calls in 7.x. They do not establish an 8.x standalone import; in particular, the fee-range helper takes a raw array rather than an engine parameter object.

Read a stored entry fee, refusing to guess its scale.

```js
const resolved = entriesGovernor.resolveEntryFee(fee);
// { amount, currencyCode, unit }
// or { indeterminate: true, reason: 'no unit — scale unknown' }

if (entriesGovernor.isIndeterminateFee(resolved)) renderFeeOnRequest(resolved.reason);
```

`unit` is required on `RegistrationEntryFee` by construction, but records written before it existed still arrive over the wire without one, and a stored record is not a compile-time object. This is the read-side counterpart to that requirement: **writes are strict, reads are tolerant, and the tolerance takes the shape of an explicit "cannot tell" rather than an assumption.**

**The unit is never inferred from magnitude.** "6000 is obviously minor units" is wrong on a real ¥6000 entry and on a genuine $6,000 pro-am, and both exist. A consumer receiving `indeterminate` should render "fee on request" or similar — anything but a figure that might be out by 100×. An absent `currencyCode` is likewise unknown, not the reader's own; defaulting it invents data.

`isIndeterminateFee` is the type guard that narrows the union.

---

## Related documentation

- [concepts/registration-profile.md](/docs/concepts/registration-profile)
- [governors/entries-governor.md](/docs/governors/entries-governor)
