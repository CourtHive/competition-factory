---
title: generateOutcomeFromScoreString
---

# generateOutcomeFromScoreString

:::warning 8.0.0 engine API transition

This method is **scheduled for removal from `mocksGovernor` at 8.0.0**. Its 7.x route still works. The name stays on `simulationGovernor`, so the engine method stays too. The removal or rename is recorded in the [8.0.0 migration guide](/docs/migration-8.0.0#by-governor). The standalone package-export decision is made per method; see the [transition index](/docs/implementation/engine-api-transition-8).

:::

## Source-local contract

The declaration below is copied from the source revision `c27dd7649e`; referenced types are defined there. It is an implementation signature, not a package import example.

```text
export function generateOutcomeFromScoreString(params);
```

## Engine effects

**State writes:** not yet assessed. **Notices:** not yet assessed. Governor query/mutate placement is not proof of purity; review the implementation and engine path before deciding exposure.

## Availability and ownership

- **Production governor declarations:** `mocksGovernor`.
- **Standalone package API after 8.0.0:** decision pending; this page does not establish a supported import.
- **Implementation:** [`src/scoring/parse/outcomeFromScoreString.ts` — `generateOutcomeFromScoreString`](https://github.com/CourtHive/competition-factory/blob/c27dd7649e/packages/competition-factory/src/scoring/parse/outcomeFromScoreString.ts). Source paths and aliases are not package import paths.
- **Replacement workflow:** use `simulationGovernor.generateOutcomeFromScoreString`, the same function. `mocksEngine.generateOutcomeFromScoreString` is unchanged: `mocksEngine` mounts `simulationGovernor`. Keep seeded calls (`nonRandom`) on `mocksEngine`.

## Related documentation

- [governors/mocks-governor.md](/docs/governors/mocks-governor)
- [governors/simulation-governor.md](/docs/governors/simulation-governor)
