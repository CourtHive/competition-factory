---
title: addNotes
---

# addNotes

:::warning 8.0.0 engine API transition

This method is a **candidate for removal from production governors and engine exports at 8.0.0**. Its 7.x route has not been removed. Final removal and standalone package-export decisions require the per-method review and external-integrator confirmation described in the [transition index](/docs/implementation/engine-api-transition-8).

:::

## Source-local contract

The declaration below is copied from the pinned source revision; referenced types are defined there. It is an implementation signature, not a package import example.

```text
export function addNotes(params?);
```

## Engine effects

**State writes:** conditional: mutates supplied element. **Notices:** none in helper. Source review: `Object.assign(params.element, { notes })`; engine ownership depends on supplied object.

## Consumer evidence

The refreshed source-name scan found no name mentions in the scanned product source files. This does not establish external-integrator non-use. The manifest records repository revisions and scan exclusions. External-integrator confirmation is pending.

## Availability and ownership

- **Production governor declarations:** `tournamentGovernor`.
- **Standalone package API after 8.0.0:** decision pending; this page does not establish a supported import.
- **Implementation:** [`src/mutate/base/addRemoveNotes.ts` — `addNotes`](https://github.com/CourtHive/competition-factory/blob/8c2aaca6801734223ef1e0a8127872344373fbd5/src/mutate/base/addRemoveNotes.ts). Source paths and aliases are not package import paths.
- **Replacement workflow:** not yet established; no supported replacement is promised.
- **Test-only adapters:** may exercise this implementation independently of production engine exports; this is not evidence of product use.

## Preserved 7.x reference

The passages below preserve the existing governor documentation. **Engine examples describe 7.x availability, not an 8.x replacement.** Source contracts take precedence where an explicitly noted correction applies.

### From governors/tournament-governor.md

Adds notes to the supplied element object. It does not resolve participant, event or draw IDs.

```js
// 7.x direct governor call: element is required.
tournamentGovernor.addNotes({ element, notes });
```

`element` must be an object; `notes` must be a non-empty string (the implementation also admits its testing sentinel). The operation mutates `element.notes`, returns success, and refuses missing notes or invalid elements/values. Entity-ID targeting previously shown here was incorrect.

## Related documentation

- [governors/tournament-governor.md](/docs/governors/tournament-governor)
