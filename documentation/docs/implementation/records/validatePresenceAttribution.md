---
title: validatePresenceAttribution
---

# validatePresenceAttribution

:::warning 8.0.0 engine API transition

This method is a **candidate for removal from production governors and engine exports at 8.0.0**. Its 7.x route has not been removed. Final removal and standalone package-export decisions require the per-method review and external-integrator confirmation described in the [transition index](/docs/implementation/engine-api-transition-8).

:::

## Source-local contract

The declaration below is copied from the pinned source revision; referenced types are defined there. It is an implementation signature, not a package import example.

```text
/**
 * Is this attester permitted by the policy in force?
 *
 * The U10 case is why `byCategory` exists: a federation requiring self-attestation from adults
 * routinely permits a PARENT, GUARDIAN or CHAPERONE to sign in a ten-year-old. A matching category
 * rule **replaces** the outer lists rather than merging with them, so a junior event can be stricter
 * as well as looser — some federations do go that way.
 *
 * An absent policy, an absent rule, or an absent attester is always `valid`. Silence is not a refusal,
 * and this function is consulted on every check-in at every tournament, most of which declare nothing.
 */
export function validatePresenceAttribution(params: {
  attributedTo?: Attribution;
  tournamentRecord?: any;
  drawDefinition?: any;
  participant?: any;
  fact: PresenceFact;
  category?: Category;
  structure?: any;
  event?: any;
}): AttributionValidation;
```

## Engine effects

**State writes:** not yet assessed. **Notices:** not yet assessed. Governor query/mutate placement is not proof of purity; review the implementation and engine path before deciding exposure.

## Consumer evidence

The refreshed source-name scan found no name mentions in the scanned product source files. This does not establish external-integrator non-use. The manifest records repository revisions and scan exclusions. External-integrator confirmation is pending.

## Availability and ownership

- **Production governor declarations:** `participantGovernor`, `queryGovernor`.
- **Standalone package API after 8.0.0:** decision pending; this page does not establish a supported import.
- **Implementation:** [`src/query/participant/presencePolicy.ts` — `validatePresenceAttribution`](https://github.com/CourtHive/competition-factory/blob/8c2aaca6801734223ef1e0a8127872344373fbd5/src/query/participant/presencePolicy.ts). Source paths and aliases are not package import paths.
- **Replacement workflow:** not yet established; no supported replacement is promised.
- **Test-only adapters:** may exercise this implementation independently of production engine exports; this is not evidence of product use.

## Implementation contract

This candidate had no dedicated governor method section to relocate. Its existing explanations remain at the documentation links below. Consult the linked source for its current signature, state requirements, returns and refusal behavior; this index does not invent a new supported contract.

## Related documentation

- [migration-7.0.0.md](/docs/migration-7.0.0)
