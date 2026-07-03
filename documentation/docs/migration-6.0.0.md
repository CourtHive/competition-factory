---
title: Migration 5.x to 6.0.0
---

Version 6.0.0 of the Competition Factory is a **major** release driven by two breaking changes — one to rating computation, one to participant birth-date storage. The headline _feature_, a [data-integrity query hierarchy](./whats-new-6.0.0#the-headline-feature--data-integrity-query-hierarchy), is purely additive and requires no migration.

This document is for **consumers** of the factory (TMX, courthive-components, the server, downstream tools). It catalogues the two breaking changes and the exact steps to adopt them. For the feature tour and the full list of 6.0.0 additions, see [What's New in 6.0.0](./whats-new-6.0.0).

## The two breaking changes at a glance

| Change                                                                    | Who is affected                                           | Action required                                  |
| ------------------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------ |
| `generateDynamicRatings({ considerGames: true })` normalisation corrected | Only callers that passed `considerGames: true`            | Re-baseline stored rating output; no code change |
| `modifyParticipant` reads/writes canonical `person.birthDate`             | Callers reading or writing `person.birthdate` (lowercase) | Rename the field to `person.birthDate`           |

## 1. `generateDynamicRatings({ considerGames: true })` normalisation

In 5.x and earlier, `generateDynamicRatings` with `considerGames: true` normalised the games contribution by a factor of approximately `1`, which under-weighted the games signal. In 6.0.0 it normalises by the **true maximum countable games** for the format — `bestOf * setTo`.

Ratings computed with `considerGames: true` **will change** as a result. The new values are correct; the old ones were not.

### What to do

- **If you never set `considerGames: true`** (the default is `false`) — nothing changes. You are not affected.
- **If you do set `considerGames: true`** — there is no code change. Re-run `generateDynamicRatings` and **re-baseline** any stored rating values against the new output. Do not attempt to reconcile old and new values numerically; treat the pre-6.0.0 values as incorrect and replace them.

```ts
const { modifications } = scaleEngine.generateDynamicRatings({
  considerGames: true, // values produced here differ from 5.x — re-baseline
  // …
});
```

→ [generateDynamicRatings](./scale-engine/scale-engine-api#generatedynamicratings).

## 2. `person.birthDate` canonicalisation

`modifyParticipant` previously read and wrote a non-canonical lowercase `person.birthdate`. In 6.0.0 it reads and writes the canonical camelCase **`person.birthDate`**, matching the rest of the factory type surface.

### What to do

Rename every read and write of the lowercase field:

```ts
// Before (5.x)
engine.modifyParticipant({
  participant: { person: { birthdate: '2009-04-01' } },
  participantId,
});
const dob = participant.person.birthdate;

// After (6.0.0)
engine.modifyParticipant({
  participant: { person: { birthDate: '2009-04-01' } },
  participantId,
});
const dob = participant.person.birthDate;
```

Search your codebase for the lowercase form:

```bash
grep -rn "\.birthdate\b" src/
```

Any stored records that carry the lowercase key should be migrated to `birthDate` at your upgrade seam. `birthDate` is the canonical field used everywhere else in the factory (see the INDIVIDUAL participant type in [Participants](./concepts/participants#individual)).

## The integrity query hierarchy is additive

The [data-integrity query hierarchy](./whats-new-6.0.0#the-headline-feature--data-integrity-query-hierarchy) (`getStructureInconsistencies`, `getDrawInconsistencies`, `getEventInconsistencies`, `getTournamentInconsistencies`, and their `*Completeness` companions) is a new read-only surface. Existing code continues to work unchanged; adopt these queries at your own pace. See the [Query Governor](./governors/query-governor) for full API details.

## Upgrading checklist

1. Bump `tods-competition-factory` to `^6.0.0` in every consumer (TMX, competition-factory-server, courthive-public, courthive-components, rankings).
2. Re-baseline any `considerGames: true` rating output against the corrected normalisation.
3. Migrate `person.birthdate` → `person.birthDate` at every read and write site.
4. Optionally adopt the integrity query hierarchy — no action is required to keep existing code working.
