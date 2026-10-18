---
title: generateDrawStructuresAndLinks
---

# generateDrawStructuresAndLinks

:::warning 8.0.0 engine API transition

This method is a **candidate for removal from production governors and engine exports at 8.0.0**. Its 7.x route has not been removed. Final removal and standalone package-export decisions require the per-method review and external-integrator confirmation described in the [transition index](/docs/implementation/engine-api-transition-8).

:::

## Source-local contract

The declaration below is copied from the pinned source revision; referenced types are defined there. It is an implementation signature, not a package import example.

```text
export function generateDrawStructuresAndLinks(params: GenerateDrawStructuresAndLinksArgs);
```

## Engine effects

**State writes:** not yet assessed. **Notices:** not yet assessed. Governor query/mutate placement is not proof of purity; review the implementation and engine path before deciding exposure.

## Consumer evidence

The refreshed source-name scan found no name mentions in the scanned product source files. This does not establish external-integrator non-use. The manifest records repository revisions and scan exclusions. External-integrator confirmation is pending.

## Availability and ownership

- **Production governor declarations:** `drawsGovernor`, `generationGovernor`.
- **Standalone package API after 8.0.0:** decision pending; this page does not establish a supported import.
- **Implementation:** [`src/assemblies/generators/drawDefinitions/generateDrawStructuresAndLinks.ts` — `generateDrawStructuresAndLinks`](https://github.com/CourtHive/competition-factory/blob/8c2aaca6801734223ef1e0a8127872344373fbd5/src/assemblies/generators/drawDefinitions/generateDrawStructuresAndLinks.ts). Source paths and aliases are not package import paths.
- **Replacement workflow:** not yet established; no supported replacement is promised.
- **Test-only adapters:** may exercise this implementation independently of production engine exports; this is not evidence of product use.

## Preserved 7.x reference

The passages below preserve the existing governor documentation. **Engine examples describe 7.x availability, not an 8.x replacement.** Source contracts take precedence where an explicitly noted correction applies.

### From governors/draws-governor.md

Generates multiple structures with linking for complex draw formats.

```js
const { structures, links } = engine.generateDrawStructuresAndLinks({
  drawDefinition, // required
  drawType, // required
  drawSize, // required
});
```

**Purpose:** Create multi-structure draws with automatic linking.

---

### From governors/generation-governor.md

Low-level method that generates structures and links for various draw types. Typically called internally by `generateDrawDefinition`.

```js
const { structures, links } = engine.generateDrawStructuresAndLinks({
  drawDefinition, // required - target drawDefinition to modify
  drawType, // required - SINGLE_ELIMINATION, ROUND_ROBIN, etc.
  drawSize, // required - number of draw positions
  structureName, // optional - custom name for main structure
  matchUpType, // optional - SINGLES, DOUBLES, TEAM
  tieFormat, // optional - for TEAM matchUps
  qualifyingProfiles, // optional - array of qualifying structure configs
  staggeredEntry, // optional - allows non-power-of-2 drawSizes
  playoffAttributes, // optional - playoff structure naming
  appliedPolicies, // optional - seeding/avoidance policies
  enforceMinimumDrawSize, // optional boolean - defaults to true
  drawTypeCoercion, // optional boolean - coerce to SINGLE_ELIMINATION for drawSize: 2
  overwriteExisting, // optional boolean - replace existing structures
  uuids, // optional - array of UUIDs for structures/matchUps
});
```

**Returns:**

```ts
{
  structures: Structure[];  // Generated structure objects
  links: DrawLink[];        // Generated link objects (for multi-stage draws)
  error?: ErrorType;
}
```

**Purpose:** Core method for generating draw structures. Handles all draw type logic including:

- Single elimination brackets
- Round robin groups
- Consolation structures
- Qualifying structures
- Playoff structures
- Feed-in and staggered entry

**Notes:**

- Used internally by `generateDrawDefinition`
- Returns generated structures and links; existing qualifying structures may be reconciled during generation
- Handles complex multi-structure draw types (Curtis, FMLC, Compass, etc.)
- Validates draw size and structure compatibility

---

## Related documentation

- [governors/draws-governor.md](/docs/governors/draws-governor)
- [governors/generation-governor.md](/docs/governors/generation-governor)
