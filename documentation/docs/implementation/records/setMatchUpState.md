---
title: setMatchUpState
---

# setMatchUpState

:::warning 8.0.0 engine API transition

This method is **scheduled for removal from `matchUpGovernor` at 8.0.0**. Its 7.x route still works. It leaves the engines with it. The removal or rename is recorded in the [8.0.0 migration guide](/docs/migration-8.0.0#by-governor). The standalone package-export decision is made per method; see the [transition index](/docs/implementation/engine-api-transition-8).

:::

## Source-local contract

The declaration below is copied from the source revision `c27dd7649e`; referenced types are defined there. It is an implementation signature, not a package import example.

```text
export function setMatchUpState(params: SetMatchUpStateArgs): any;
```

## Engine effects

**State writes:** yes. **Notices:** not yet assessed. Governor query/mutate placement is not proof of purity; review the implementation and engine path before deciding exposure.

## Availability and ownership

- **Production governor declarations:** `matchUpGovernor`.
- **Standalone package API after 8.0.0:** decision pending; this page does not establish a supported import.
- **Implementation:** [`src/mutate/matchUps/matchUpStatus/setMatchUpState.ts` — `setMatchUpState`](https://github.com/CourtHive/competition-factory/blob/c27dd7649e/packages/competition-factory/src/mutate/matchUps/matchUpStatus/setMatchUpState.ts). Source paths and aliases are not package import paths.
- **Replacement workflow:** use `setMatchUpStatus`, the public route for a matchUp status and outcome.

## Related documentation

- [governors/matchup-governor.md](/docs/governors/matchup-governor)
