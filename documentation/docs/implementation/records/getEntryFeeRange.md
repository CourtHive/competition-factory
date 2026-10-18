---
title: getEntryFeeRange
---

# getEntryFeeRange

:::warning 8.0.0 engine API transition

This method is a **candidate for removal from production governors and engine exports at 8.0.0**. Its 7.x route has not been removed. Final removal and standalone package-export decisions require the per-method review and external-integrator confirmation described in the [transition index](/docs/implementation/engine-api-transition-8).

:::

## Source-local contract

The declaration below is copied from the pinned source revision; referenced types are defined there. It is an implementation signature, not a package import example.

```text
/**
 * The lowest and highest of a set of fees — or nothing, when they cannot honestly be compared.
 *
 * A displayed price range ("$30–$155") is only meaningful if every contributing fee is denominated
 * identically. Comparing across currencies picks the smaller NUMBER rather than the smaller VALUE:
 * 40 EUR "beats" 45 USD on arithmetic that means nothing. So the range is computed only over the
 * single most common `currencyCode`/`unit` pair, and everything else is REPORTED rather than folded
 * in or dropped.
 *
 * Returns `undefined` when no fee can be resolved at all, so the caller renders nothing rather than
 * a zero.
 */
export function getEntryFeeRange(fees?: RegistrationEntryFee[] | null): EntryFeeRange | undefined;
```

## Engine effects

**State writes:** not yet assessed. **Notices:** not yet assessed. Governor query/mutate placement is not proof of purity; review the implementation and engine path before deciding exposure.

## Consumer evidence

The refreshed source-name scan found no name mentions in the scanned product source files. This does not establish external-integrator non-use. The manifest records repository revisions and scan exclusions. External-integrator confirmation is pending.

## Availability and ownership

- **Production governor declarations:** `entriesGovernor`, `queryGovernor`.
- **Standalone package API after 8.0.0:** decision pending; this page does not establish a supported import.
- **Implementation:** [`src/query/entries/resolveEntryFee.ts` — `getEntryFeeRange`](https://github.com/CourtHive/competition-factory/blob/8c2aaca6801734223ef1e0a8127872344373fbd5/src/query/entries/resolveEntryFee.ts). Source paths and aliases are not package import paths.
- **Replacement workflow:** not yet established; no supported replacement is promised.
- **Test-only adapters:** may exercise this implementation independently of production engine exports; this is not evidence of product use.

## Preserved 7.x reference

The passages below preserve the existing governor documentation. **Engine examples describe 7.x availability, not an 8.x replacement.** Source contracts take precedence where an explicitly noted correction applies.

### From governors/entries-governor.md

These are direct governor calls in 7.x. They do not establish an 8.x standalone import; in particular, the fee-range helper takes a raw array rather than an engine parameter object.

The lowest and highest of a set of fees — or nothing, when they cannot be compared.

```js
const range = entriesGovernor.getEntryFeeRange(fees);
// { min: { amount, currencyCode, unit }, max: { ... }, indeterminate: [], incomparable: [] }
```

A displayed price range ("$30–$155") is only meaningful if every contributing fee is denominated identically. Comparing across currencies picks the smaller **number** rather than the smaller **value**: 40 EUR "beats" 45 USD on arithmetic that means nothing.

So the range is computed only over the single most common `currencyCode`/`unit` pair — the largest group, so one stray currency does not suppress an otherwise usable range — and everything else is **reported rather than folded in or dropped**:

- `indeterminate` — fees that could not be resolved at all, present so a caller can disclose rather than hide them.
- `incomparable` — the distinct `currencyCode`/`unit` pairs found beyond the one the range is denominated in.

Returns `undefined` when no fee can be resolved at all, so the caller renders nothing rather than a zero.

---

## Related documentation

- [concepts/tournament-discovery.md](/docs/concepts/tournament-discovery)
- [governors/entries-governor.md](/docs/governors/entries-governor)
