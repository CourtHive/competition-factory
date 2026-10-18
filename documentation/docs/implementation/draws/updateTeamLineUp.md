---
title: updateTeamLineUp
---

# updateTeamLineUp

:::warning 8.0.0 engine API transition

This method is a **candidate for removal from production governors and engine exports at 8.0.0**. Its 7.x route has not been removed. Final removal and standalone package-export decisions require the per-method review and external-integrator confirmation described in the [transition index](/docs/implementation/engine-api-transition-8).

:::

## Source-local contract

The declaration below is copied from the pinned source revision; referenced types are defined there. It is an implementation signature, not a package import example.

```text
export function updateTeamLineUp({ drawDefinition, participantId, tieFormat, lineUp }: UpdateTeamLineUpArgs): {
  success?: boolean;
  error?: ErrorType;
};
```

## Engine effects

**State writes:** not yet assessed. **Notices:** not yet assessed. Governor query/mutate placement is not proof of purity; review the implementation and engine path before deciding exposure.

## Consumer evidence

The refreshed source-name scan found no name mentions in the scanned product source files. This does not establish external-integrator non-use. The manifest records repository revisions and scan exclusions. External-integrator confirmation is pending.

## Availability and ownership

- **Production governor declarations:** `drawsGovernor`.
- **Standalone package API after 8.0.0:** decision pending; this page does not establish a supported import.
- **Implementation:** [`src/mutate/drawDefinitions/updateTeamLineUp.ts` — `updateTeamLineUp`](https://github.com/CourtHive/competition-factory/blob/8c2aaca6801734223ef1e0a8127872344373fbd5/src/mutate/drawDefinitions/updateTeamLineUp.ts). Source paths and aliases are not package import paths.
- **Replacement workflow:** not yet established; no supported replacement is promised.
- **Test-only adapters:** may exercise this implementation independently of production engine exports; this is not evidence of product use.

## Preserved 7.x reference

The passages below preserve the existing governor documentation. **Engine examples describe 7.x availability, not an 8.x replacement.** Source contracts take precedence where an explicitly noted correction applies.

### From governors/draws-governor.md

See [validateLineUp](/docs/governors/participant-governor#validatelineup)

```js
engine.updateTeamLineUp({
  participantId, // id of the team for which lineUp is being updated
  tieFormat, // valid tieFormat - used to validate collectionIds
  lineUp, // valid lineUp array
  drawId, // required as latest lineUp modification is stored in an extension on drawDefinition
});
```

---

## Related documentation

- [governors/draws-governor.md](/docs/governors/draws-governor)
