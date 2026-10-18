---
title: getPresenceRules
---

# getPresenceRules

:::warning 8.0.0 engine API transition

This method is a **candidate for removal from production governors and engine exports at 8.0.0**. Its 7.x route has not been removed. Final removal and standalone package-export decisions require the per-method review and external-integrator confirmation described in the [transition index](/docs/implementation/engine-api-transition-8).

:::

## Source-local contract

The declaration below is copied from the pinned source revision; referenced types are defined there. It is an implementation signature, not a package import example.

```text
/**
 * The presence rules in force, resolved through the ordinary policy hierarchy
 * (structure → draw → event → tournament), exactly as `getLadderPolicy` resolves its own.
 *
 * Returns `undefined` when no sanctioning policy declares `presence`. That is **not** the same as
 * declaring `notUsed`, and callers must keep the two apart: an undeclared tournament is one where the
 * question was never answered, so a client's own heuristic is still the best available answer for it.
 * `POLICY_TYPE_SANCTIONING` is optional and most tournaments will carry none indefinitely.
 */
export function getPresenceRules(params: {
  tournamentRecord?: any;
  drawDefinition?: any;
  structure?: any;
  event?: any;
}): PresenceRules | undefined;
```

## Engine effects

**State writes:** not yet assessed. **Notices:** not yet assessed. Governor query/mutate placement is not proof of purity; review the implementation and engine path before deciding exposure.

## Consumer evidence

The refreshed source-name scan found no name mentions in the scanned product source files. This does not establish external-integrator non-use. The manifest records repository revisions and scan exclusions. External-integrator confirmation is pending.

## Availability and ownership

- **Production governor declarations:** `participantGovernor`, `queryGovernor`.
- **Standalone package API after 8.0.0:** decision pending; this page does not establish a supported import.
- **Implementation:** [`src/query/participant/presencePolicy.ts` — `getPresenceRules`](https://github.com/CourtHive/competition-factory/blob/8c2aaca6801734223ef1e0a8127872344373fbd5/src/query/participant/presencePolicy.ts). Source paths and aliases are not package import paths.
- **Replacement workflow:** not yet established; no supported replacement is promised.
- **Test-only adapters:** may exercise this implementation independently of production engine exports; this is not evidence of product use.

## Implementation contract

This candidate had no dedicated governor method section to relocate. Its existing explanations remain at the documentation links below. Consult the linked source for its current signature, state requirements, returns and refusal behavior; this index does not invent a new supported contract.
