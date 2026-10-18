---
title: getPresenceExpectation
---

# getPresenceExpectation

:::warning 8.0.0 engine API transition

This method is a **candidate for removal from production governors and engine exports at 8.0.0**. Its 7.x route has not been removed. Final removal and standalone package-export decisions require the per-method review and external-integrator confirmation described in the [transition index](/docs/implementation/engine-api-transition-8).

:::

## Source-local contract

The declaration below is copied from the pinned source revision; referenced types are defined there. It is an implementation signature, not a package import example.

```text
/**
 * What the policy expects of this role for this fact.
 *
 * ⚠️ Returns a POLICY VALUE, not an instruction. `required` does not mean "block" — D4d's finding is
 * that a hard block teaches pre-emptive compliance and destroys the signal. Each surface decides what
 * to do with it; the factory refuses nothing on this basis.
 *
 * `declared: false` distinguishes "the policy says notUsed" from "no policy said anything", which are
 * the two states a client's heuristic exists to tell apart.
 */
export function getPresenceExpectation(params: {
  tournamentRecord?: any;
  drawDefinition?: any;
  participant?: any;
  fact: PresenceFact;
  structure?: any;
  event?: any;
}): { expectation?: PresenceExpectation; declared: boolean; role: string };
```

## Engine effects

**State writes:** not yet assessed. **Notices:** not yet assessed. Governor query/mutate placement is not proof of purity; review the implementation and engine path before deciding exposure.

## Consumer evidence

The refreshed source-name scan found no name mentions in the scanned product source files. This does not establish external-integrator non-use. The manifest records repository revisions and scan exclusions. External-integrator confirmation is pending.

## Availability and ownership

- **Production governor declarations:** `participantGovernor`, `queryGovernor`.
- **Standalone package API after 8.0.0:** decision pending; this page does not establish a supported import.
- **Implementation:** [`src/query/participant/presencePolicy.ts` — `getPresenceExpectation`](https://github.com/CourtHive/competition-factory/blob/8c2aaca6801734223ef1e0a8127872344373fbd5/src/query/participant/presencePolicy.ts). Source paths and aliases are not package import paths.
- **Replacement workflow:** not yet established; no supported replacement is promised.
- **Test-only adapters:** may exercise this implementation independently of production engine exports; this is not evidence of product use.

## Implementation contract

This candidate had no dedicated governor method section to relocate. Its existing explanations remain at the documentation links below. Consult the linked source for its current signature, state requirements, returns and refusal behavior; this index does not invent a new supported contract.

## Related documentation

- [migration-7.0.0.md](/docs/migration-7.0.0)
