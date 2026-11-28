# @courthive/competition-catalogue

Starting templates for [tods-competition-factory](https://www.npmjs.com/package/tods-competition-factory): tie
formats, policies and competition formats modelled on published sources, as plain data. Copy one and own it.

**These are templates, not authorities.** Each is modelled on a source such as a governing body's regulations, a
league's handbook or a rating method's paper. CourtHive does not maintain them against their sources: when a source
changes, a template here may not. The bodies they are modelled on have not reviewed or endorsed them. A competition
that applies one of these is applying CourtHive's reading of the source, not the source itself. To use a template,
copy it into a policy or format you own and check it against the current source.

The factory engine resolves no names: a caller passes a concrete `tieFormat` or policy object. It has no runtime
dependencies and imports nothing from the engine.

## Install

```bash
pnpm add @courthive/competition-catalogue
```

## Use

```ts
import {
  TEMPLATE_SEEDING_ITF,
  ratingsPresets,
  resolveTieFormat,
  tieFormatConstants,
} from '@courthive/competition-catalogue';

// a tie format: a fresh copy without collection ids, which the engine mints
tournamentEngine.addEvent({
  event: { eventType: 'TEAM', tieFormat: resolveTieFormat(tieFormatConstants.DOMINANT_DUO) },
});

// a policy template: attach the object (or a copy of it you have made your own)
tournamentEngine.attachPolicies({ policyDefinitions: TEMPLATE_SEEDING_ITF });

// a ratings preset: pass the policy, not its name
const competitionFormat = { ratingsPolicy: ratingsPresets.TEMPLATE_RATINGS_ELO_538_NHL };
```

## Contents

| Export                                             | What it holds                                                                                                     |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `tieFormats`, `tieFormatConstants`                 | 19 tie format templates and their names                                                                           |
| `resolveTieFormat(name)`                           | a copy of a named tie format without `collectionId`s, or `undefined`                                              |
| `policies` and each `TEMPLATE_*`                   | 37 policy templates (ranking points, ratings, standings, seeding, scoring, sanctioning, officiating, progression) |
| `ratingsPresets`                                   | the 10 ratings presets by `TEMPLATE_RATINGS_*` name, each a bare ratings policy                                   |
| `competitionFormats`, `competitionFormatConstants` | the named competition formats and their names                                                                     |
| `catalogueEntries`, `entryVersions`                | every entry with its kind, name, version and provenance                                                           |
| `provenance`                                       | each entry's provenance by name                                                                                   |

The factory's own defaults (the policies the engine falls back to, and the provider-neutral presets) stay in
`tods-competition-factory` under `fixtures.policies`, named `POLICY_*`. CourtHive maintains those. A `TEMPLATE_*` name
is always one of this package's templates.

## Provenance

Every entry carries `provenance`, also exported as a map by name:

```ts
type CatalogueProvenance = {
  status: 'template';
  modelledOn: string; // the body, league or method the content is modelled on: 'ATP', 'USTA', 'FiveThirtyEight'
  sourceDocument?: string; // the published document it was read from, when known
  maintainer: 'CourtHive';
  maintained: false; // CourtHive does not track the source's changes
  endorsed: false; // the body named has not reviewed or endorsed it
};
```

It sits beside the entry, not in its definition, so the engine never reads it and attaching a template does not carry
it onto a record. Names inside a definition, such as `policyName` or a ranking policy's `pointsAuthority`, describe
what the template models. A copy you own should set its own.

## Versions

The package versions independently of the factory. Each entry also carries its own version in `entryVersions`, raised
whenever that entry's content changes, so a host that stores an entry can tell which content it holds. A stored
tournament record never needs this package to be read: it holds the full `tieFormat` and policy values it was created
with, and a `tieFormatName` on it is a label only.
