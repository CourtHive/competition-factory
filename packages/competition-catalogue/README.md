# @courthive/competition-catalogue

Named tie formats, organisation policies and competition formats for
[tods-competition-factory](https://www.npmjs.com/package/tods-competition-factory), as plain data.

The factory engine resolves no names: a caller passes a concrete `tieFormat` or policy object. This package holds the
published objects that callers choose from. It has no runtime dependencies and imports nothing from the engine.

## Install

```bash
pnpm add @courthive/competition-catalogue
```

## Use

```ts
import {
  POLICY_SEEDING_ITF,
  ratingsPresets,
  resolveTieFormat,
  tieFormatConstants,
} from '@courthive/competition-catalogue';

// a tie format: a fresh copy without collection ids, which the engine mints
tournamentEngine.addEvent({
  event: { eventType: 'TEAM', tieFormat: resolveTieFormat(tieFormatConstants.DOMINANT_DUO) },
});

// a policy: attach the object
tournamentEngine.attachPolicies({ policyDefinitions: POLICY_SEEDING_ITF });

// a ratings preset: pass the policy, not its name
const competitionFormat = { ratingsPolicy: ratingsPresets.POLICY_RATINGS_ELO_538_NHL };
```

## Contents

| Export                                             | What it holds                                                                                                          |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `tieFormats`, `tieFormatConstants`                 | 19 named tie formats and their names                                                                                   |
| `resolveTieFormat(name)`                           | a copy of a named tie format without `collectionId`s, or `undefined`                                                   |
| `policies` and each `POLICY_*`                     | 30 organisation policies (ranking points, ratings, standings, seeding, scoring, sanctioning, officiating, progression) |
| `ratingsPresets`                                   | the 10 ratings presets by name, each a bare ratings policy                                                             |
| `competitionFormats`, `competitionFormatConstants` | the named competition formats and their names                                                                          |
| `catalogueEntries`, `entryVersions`                | every entry with its kind, name and version                                                                            |

The factory's own defaults (the policies the engine falls back to, and the provider-neutral presets) stay in
`tods-competition-factory` under `fixtures.policies`.

## Versions

The package versions independently of the factory. Each entry also carries its own version in `entryVersions`, raised
whenever that entry's content changes, so a host that stores an entry can tell which content it holds. A stored
tournament record never needs this package to be read: it holds the full `tieFormat` and policy values it was created
with, and a `tieFormatName` on it is a label only.
