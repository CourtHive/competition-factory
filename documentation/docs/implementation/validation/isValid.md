---
title: isValid
---

# isValid

:::warning 8.0.0 engine API transition

This method is **scheduled for removal from `matchUpFormatGovernor` at 8.0.0**. Its 7.x route still works. It leaves the engines with it. The removal or rename is recorded in the [8.0.0 migration guide](/docs/migration-8.0.0#by-governor). The standalone package-export decision is made per method; see the [transition index](/docs/implementation/engine-api-transition-8).

:::

## Source-local contract

The declaration below is copied from the source revision `c27dd7649e`; referenced types are defined there. It is an implementation signature, not a package import example.

```text
export function isValidMatchUpFormat({ matchUpFormat }: { matchUpFormat: string }): boolean;
```

## Engine effects

**State writes:** not yet assessed. **Notices:** not yet assessed. Governor query/mutate placement is not proof of purity; review the implementation and engine path before deciding exposure.

## Availability and ownership

- **Production governor declarations:** `matchUpFormatGovernor`.
- **Standalone package API after 8.0.0:** decision pending; this page does not establish a supported import.
- **Implementation:** [`src/validators/isValidMatchUpFormat.ts` — `isValidMatchUpFormat`](https://github.com/CourtHive/competition-factory/blob/c27dd7649e/packages/competition-factory/src/validators/isValidMatchUpFormat.ts). Source paths and aliases are not package import paths.
- **Replacement workflow:** use `tools.formats.isValidMatchUpFormat`, the function this aliases (available from 7.49). The alias is not carried over.

## Related documentation

- [governors/matchup-format-governor.md](/docs/governors/matchup-format-governor)
