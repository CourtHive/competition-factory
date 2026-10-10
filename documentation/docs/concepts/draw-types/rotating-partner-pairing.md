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

The same roster and returned `seedUsed` reproduce the same schedule regardless of input order. Retain `seedUsed` when requesting later rounds. An optional `roundsCount` selects a prefix of the complete schedule; it must be a positive integer no greater than the available rounds. Partial schedules return `completeCoverage: false` and retain the full `expectedRounds` value.

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

Pure pairing generators remain independent of persistence and scoring. Configured-draw APIs apply rounds atomically and compute individual standings. `SET1-S:P32` stops at a combined total of 32; `SET1-S:P32DP` adds a deciding rally after 16–16 and `SET1-S:P32WB2` extends tied play until a two-point margin.

When both `matchUpsCount` and explicit pairings are supplied, they must agree; a mismatch returns `INVALID_VALUES` with both counts in context. Explicit pairings bypass entry-count estimates.

Mexicano accepts an optional positive safe-integer `roundNumber`. With it, `seed` is the base seed and a deterministic round seed is derived. The result reports `baseSeed` for `drawDefinition.competitionProfile` and `seedUsed` for that round. Save an automatically chosen `baseSeed` before generating subsequent rounds. Replaying the same base seed, round number and standings reproduces the round; changing the round number varies tie ordering but does not prohibit repeated partnerships. For direct replay, pass `seedUsed` as `seed` and omit `roundNumber`. Without `roundNumber`, the seed is used directly as before.

Use the [competition profile](./competition-profile.md) attribute to retain format configuration on the drawDefinition. Profiles configure the format; applied rounds save their historical scoring and tally rules.

IDs are sorted canonically before shuffling: a saved seed and unchanged roster reproduce the same schedule regardless of input order. `opponentBalance` reports `minEncounters`, `maxEncounters` and `unseenPairs` across every unordered pair of individuals, including zero encounters. Metrics cover the returned rounds, including an incomplete prefix.

## Individual standings and later rounds

`getRotatingPartnerStandings({ drawId, throughRoundNumber })` returns player `standings`, per-player
`contributions`, `unresolved` results and the inclusive cutoff. Omit the cutoff for all applied rounds;
zero returns the initial roster. Points scored determine descending rank; equal totals share rank.
IDs determine only display order within ties. A 17–15 score credits 17/17/15/15. Corrections and clears
change current standings without rearranging previously applied rounds. No standings table is persisted.

Attach a `rotatingPartnerTally` policy using normal tournament/event/draw precedence:

```typescript
const policyDefinitions = {
  rotatingPartnerTally: {
    version: 1,
    decidingPoints: 'INCLUDE',
    overtimePoints: 'INCLUDE',
    statusTreatments: {
      RETIRED: { kind: 'PLAYED_POINTS' },
      WALKOVER: { kind: 'CREDIT', winningPoints: 20, losingPoints: 0 },
      CANCELLED: { kind: 'EXCLUDE' },
    },
  },
};
```

`getRotatingPartnerTallyPolicy({ drawId, structureId })` also resolves structure precedence, used by
round preview. Defaults include actual deciding/overtime points. Nonstandard terminal results remain
unresolved unless configured as `PLAYED_POINTS`, `CREDIT`, or `EXCLUDE`; `UNRESOLVED` is explicit too.
Pending/live statuses cannot be settled by policy, and ordinary COMPLETED results always contribute.
Credits require nonnegative safe integers and a winning side; they are distinct from played points
and do not increment matches played when no played score exists. A retained partial score remains
visible as played points even when the policy awards credits instead. Retirement scores must validate
under the saved scoring contract.
Excluding extra points preserves the sporting win while crediting tied base points. Separate deciding
phases remain unsupported.

Each round saves its resolved `tallyContract`; policy changes affect new rounds only. Missing historical
contracts are refused rather than reconstructed from today's policy. This pre-release shape has not shipped.

Mexicano previews require every prior result to be settled. Application saves the exact source
`standingsSnapshot` and `standingsThroughRoundNumber`. Changed scores invalidate approval when they
change pairings; unchanged approved pairings remain eligible. The scoring contract is checked too.
Request-ID retries return the original applied round and its historical source standings.

## Audited settlement of exit results

`settleRotatingPartnerResult` settles individual tally attribution for a non-completed terminal result
in an applied round. It never changes the score, sporting winner or saved round policy. Supply `drawId`,
`matchUpId`, unique `requestId`, `expectedOutcome` (current status, score and winningSide), `treatment`,
`reason`, `recordedBy` and a canonical UTC `recordedAt`, such as `2026-10-10T20:00:00.000Z`.

Choose `PLAYED_POINTS` to count validated recorded play, `EXCLUDE` to settle without points, or `CREDIT`
to award `winningPoints` and `losingPoints` using the result's recorded winningSide. `UNRESOLVED` revokes
an adjudication. Live and ordinary completed results are refused. A replacement requires
`supersedesRequestId` identifying the latest adjudication for that match.

The draw's append-only `competitionSettlements` retains every decision. Duplicate identical requests
return the existing settlement; stale outcomes or conflicting retries refuse without writes. Later
score/status/winner corrections make the latest settlement stale: standings report `staleSettlementIds`
and a non-completed result remains unresolved until re-settled. A valid COMPLETED correction resumes the ordinary tally contract and retains the old settlement as historical audit. Contributions identify their `settlementRequestId`.
A settled result can unlock the next Mexicano round; existing later rounds retain their source snapshots.
DRAWS locks apply. `recordedBy` is caller-supplied audit metadata; the server authenticates and authorizes
operators. TMX should preview individual credits and require a reason before submitting this mutation.
