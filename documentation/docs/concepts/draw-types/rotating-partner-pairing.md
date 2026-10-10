---
title: Rotating Partner Pairing
---

# Rotating Partner Pairing

`generateAmericanoPairings` and `generateMexicanoPairings` produce doubles sides from individual participant IDs. These pure generators return partner memberships without creating PAIR participants, draw entries or matchUps. They are available through `generationGovernor` and `tournamentEngine`.

Both require at least four distinct, nonempty IDs and a player count divisible by four. Other counts return `INVALID_VALUES`; rest allocation is not inferred. A supplied seed must be a safe integer. Without one, each call draws a seed from its `random` parameter, the configured factory random source, or `Math.random`, in that order. Both generators return `seedUsed`; save it to replay the output. Engine `nonRandom` supplies the call-specific random source.

## Americano

```typescript
import { tournamentEngine } from 'tods-competition-factory';

const participantIds = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const result = tournamentEngine.generateAmericanoPairings({ participantIds, seed: 42 });
// result.rounds: seven rounds, each containing two doubles matches.
// A match is [[individualId, individualId], [individualId, individualId]].
// result.expectedRounds === 7; result.completeCoverage === true.
```

The circle-method partnership rotation guarantees that each player partners every other player exactly once over `participantIds.length - 1` rounds. Every player appears once per round. A deterministic greedy opponent-selection step favors fewer repeated individual opponents; globally optimal opponent balance is not guaranteed.

The same ordered input and returned `seedUsed` reproduce the same schedule. Retain that order and `seedUsed` when requesting later rounds. An optional `roundsCount` selects a prefix of the complete schedule; it must be a positive integer no greater than the available rounds. Partial schedules return `completeCoverage: false` and retain the full `expectedRounds` value.

## Mexicano

```typescript
import { tournamentEngine } from 'tods-competition-factory';

const standings = [
  { participantId: 'a', pointsScored: 57 },
  { participantId: 'b', pointsScored: 53 },
  { participantId: 'c', pointsScored: 48 },
  { participantId: 'd', pointsScored: 42 },
];
const result = tournamentEngine.generateMexicanoPairings({ standings, seed: 42 });
// result.round === [[['a', 'd'], ['b', 'c']]]
// result.orderedParticipantIds === ['a', 'b', 'c', 'd']
```

The generator orders players by points scored, groups adjacent players in fours and pairs first/fourth against second/third. Points must be nonnegative safe integers. Equal scores use seeded random ordering from a canonical ID order, so reversing the input array does not change a tied-score round. This resolves pairing order, not final sporting ranks.

For the first round, zero-point standings give a seeded initial grouping. Each call generates one round; it does not check previous-round completion or set an event stopping rule. Repeated partnerships are permitted. The caller supplies the authoritative standings snapshot and retains its seed when applying the preview.

## Applying pairings and scoring

Translate each returned side into an existing or newly created PAIR participant with those immutable individual memberships. Existing AD_HOC APIs can then generate and insert matchUps from explicit PAIR IDs. Candidate partnership entry count does not determine the explicit matchUp output limit: a pool of 66 PAIR entries can supply three legal matches for twelve people. The default limit remains 32 generated matchUps per call.

These APIs provide pairing foundations, not complete Americano/Mexicano event orchestration. They do not calculate individual standings, validate fixed combined-point totals, resolve 16–16 completion, or atomically apply round previews. A first-to-32 scoring format does not represent a match that stops when the two sides' scores sum to 32.

When both `matchUpsCount` and explicit pairings are supplied, they must agree; a mismatch returns `INVALID_VALUES` with both counts in context. Explicit pairings bypass entry-count estimates.

Mexicano accepts an optional positive safe-integer `roundNumber`. With it, `seed` is the base seed and a deterministic round seed is derived. The result reports `baseSeed` for `drawDefinition.competitionProfile` and `seedUsed` for that round. Save an automatically chosen `baseSeed` before generating subsequent rounds. Replaying the same base seed, round number and standings reproduces the round; changing the round number varies tie ordering but does not prohibit repeated partnerships. For direct replay, pass `seedUsed` as `seed` and omit `roundNumber`. Without `roundNumber`, the seed is used directly as before.

Use the [competition profile](./competition-profile.md) attribute to retain format configuration on the drawDefinition. Profile storage does not yet apply rounds or interpret scores.

IDs are sorted canonically before shuffling: a saved seed and unchanged roster reproduce the same schedule regardless of input order. `opponentBalance` reports `minEncounters`, `maxEncounters` and `unseenPairs` across every unordered pair of individuals, including zero encounters. Metrics cover the returned rounds, including an incomplete prefix.
