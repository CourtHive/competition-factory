---
title: isVisiblyPublished
---

# isVisiblyPublished

:::warning 8.0.0 engine API transition

This method is a **candidate for removal from production governors and engine exports at 8.0.0**. Its 7.x route has not been removed. Final removal and standalone package-export decisions require the per-method review and external-integrator confirmation described in the [transition index](/docs/implementation/engine-api-transition-8).

:::

## Source-local contract

The declaration below is copied from the pinned source revision; referenced types are defined there. It is an implementation signature, not a package import example.

```text
export function isVisiblyPublished(detail?: PublishingDetail): boolean;
```

## Engine effects

**State writes:** not yet assessed. **Notices:** not yet assessed. Governor query/mutate placement is not proof of purity; review the implementation and engine path before deciding exposure.

## Consumer evidence

The refreshed source-name scan found no name mentions in the scanned product source files. This does not establish external-integrator non-use. The manifest records repository revisions and scan exclusions. External-integrator confirmation is pending.

## Availability and ownership

- **Production governor declarations:** `publishingGovernor`, `queryGovernor`.
- **Standalone package API after 8.0.0:** decision pending; this page does not establish a supported import.
- **Implementation:** [`src/query/publishing/isEmbargoed.ts` — `isVisiblyPublished`](https://github.com/CourtHive/competition-factory/blob/8c2aaca6801734223ef1e0a8127872344373fbd5/src/query/publishing/isEmbargoed.ts). Source paths and aliases are not package import paths.
- **Replacement workflow:** not yet established; no supported replacement is promised.
- **Test-only adapters:** may exercise this implementation independently of production engine exports; this is not evidence of product use.

## Preserved 7.x reference

The passages below preserve the existing governor documentation. **Engine examples describe 7.x availability, not an 8.x replacement.** Source contracts take precedence where an explicitly noted correction applies.

### From governors/publishing-governor.md

Returns `true` if a publishing detail is both published **and** not currently embargoed. Combines the `published` flag check with the embargo expiry check.

```js
import { publishingGovernor } from 'tods-competition-factory';

const drawDetail = publishState?.status?.drawDetails?.[drawId]?.publishingDetail;

if (publishingGovernor.isVisiblyPublished(drawDetail)) {
  // Draw is published and any embargo has expired — show to public
}
```

**Parameters:**

| Parameter | Type                            | Description                                                                  |
| --------- | ------------------------------- | ---------------------------------------------------------------------------- |
| `detail`  | `PublishingDetail \| undefined` | Any publishing detail object with `published` and optional `embargo` fields. |

**Returns:** `boolean` — `true` when `detail.published === true` and `isEmbargoed(detail)` is `false`.

**Purpose:** Determine if content should be visible to end users, respecting both the publish flag and any active embargo.

---

## Related documentation

- [governors/publishing-governor.md](/docs/governors/publishing-governor)
- [migration-3.0.0.md](/docs/migration-3.0.0)
- [migration-7.0.0.md](/docs/migration-7.0.0)
