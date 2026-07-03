---
title: What's New in 6.0.0
---

Version 6.0.0 of the Competition Factory ships **two breaking changes** to rating computation and participant birth-date storage, and one headline feature: a **data-integrity query hierarchy** that scans a tournament for contradictory state at the structure, draw, event, and tournament levels.

For upgrade mechanics — the two breaking changes and the field-rename table — see the [5.x to 6.0.0 migration guide](./migration-6.0.0).

For the full per-commit changelog see [CHANGELOG.md](https://github.com/CourtHive/competition-factory/blob/master/CHANGELOG.md).

## The headline changes

Two changes break the surface and need consumer attention. Both are covered in detail in the [migration guide](./migration-6.0.0).

### 1. `generateDynamicRatings({ considerGames: true })` normalises correctly

`generateDynamicRatings` with `considerGames: true` now normalises by the true maximum countable games (`bestOf * setTo`) rather than the previous ~1. Ratings computed with `considerGames: true` **will change** — the new values are correct, the old ones were not.

Only callers that opted into `considerGames: true` are affected. There is no code change required: re-baseline any stored output against the new values.

→ [generateDynamicRatings](./scale-engine/scale-engine-api#generatedynamicratings).

### 2. `modifyParticipant` uses canonical `person.birthDate`

`modifyParticipant` now reads and writes the canonical `person.birthDate` (camelCase) instead of the previous non-canonical `person.birthdate`. Callers reading or writing the lowercase field must switch to `person.birthDate`.

→ [Participants](./concepts/participants).

## The headline feature — data-integrity query hierarchy

A **read-only integrity surface** that answers _"is this tournament's decided state self-consistent?"_ without loading a full engine — useful at publish checkpoints, in CI, and when validating draw records reconstructed by hand (third-party ingest). Every finding carries `severity`, `scope`, provenance ids, and a stable dedup `fingerprint`.

The hierarchy has four levels; each fans out to the level below and adds the checks that require its own scope in view:

```text
getTournamentInconsistencies   cross-event checks (identity duplication)
  └─ getEventInconsistencies    eventType ↔ participantType coherence
      └─ getDrawInconsistencies  cross-structure LINK + progression integrity
          └─ getStructureInconsistencies   (leaf) decided-state invariants
```

Each inconsistency function has a `*Completeness` companion that composes the same way, reporting **outstanding work** (unassigned positions, unplayed matchUps) rather than contradictions.

### The leaf — `getStructureInconsistencies` / `getStructureCompleteness`

Decided-state invariants and outstanding-work reporting for a single structure. Adds `DRAW_POSITION_UNASSIGNED` (a stored-state phantom position) and `WINNER_NOT_ADVANCED` (a winner absent from its next matchUp within the structure), backed by a CI corpus sweep across every draw type × sizes 8/16/32/64.

→ [getStructureInconsistencies](./governors/query-governor#getstructureinconsistencies), [getStructureCompleteness](./governors/query-governor#getstructurecompleteness).

### The draw layer — `getDrawInconsistencies` / `getDrawCompleteness`

Cross-structure **link** integrity (`DANGLING_LINK`, `LINK_MISSING_SOURCE_ROUND`) and **progression** (`DROPPED_PROGRESSION`): a loser or winner _eligible_ to feed a linked target structure but absent from it. Eligibility reuses the engine's own feed logic (`getDrawPositionWinCount`, shared with the mutation path), so first-match-loser-consolation and double-elimination feed-back are handled correctly.

→ [getDrawInconsistencies](./governors/query-governor#getdrawinconsistencies), [getDrawCompleteness](./governors/query-governor#getdrawcompleteness).

### The event layer — `getEventInconsistencies` / `getEventCompleteness`

`eventType` ↔ `participantType` coherence across the event's draws.

→ [getEventInconsistencies](./governors/query-governor#geteventinconsistencies), [getEventCompleteness](./governors/query-governor#geteventcompleteness).

### The top layer — `getTournamentInconsistencies` / `getTournamentCompleteness`

Cross-event checks — a person represented by two distinct **individual** participants is flagged; a person legitimately appearing across multiple pair/team groupings is not.

→ [getTournamentInconsistencies](./governors/query-governor#gettournamentinconsistencies), [getTournamentCompleteness](./governors/query-governor#gettournamentcompleteness).

## Other 6.0.0 additions

- **`getMatchUpFormatVariance`** — report matchUpFormat variance across a draw's structures. Round-robin group structures are now correctly exempt from the ascending-drawPositions-sort inconsistency check (Berger round-pairing order is legitimate). See [getMatchUpFormatVariance](./governors/query-governor#getmatchupformatvariance).
- **`abandonTournamentMatchUps`** — bulk-abandon still-playable matchUps in a single call. See [abandonTournamentMatchUps](./governors/matchup-governor#abandontournamentmatchups).
- **Exit-propagation fixes** — a cluster of corrections to how `WALKOVER` / `DEFAULTED` statuses cascade through consolation byes and unwind on removal: re-derive `winningSide` / exit codes on advancement, clear stale codes when a pending propagated exit is removed, block reset of a source whose exit resolved downstream, and gate `propagateExitStatus` by scoring policy.
- **Entry / matchUp validation** — enforce mixed-doubles second-participant gender, age-check individual members of PAIR/TEAM entries, and block un-assigning participants from completed ad-hoc matchUps.
- **`tieFormat`** — preserve existing `collectionGroups` when adding a group.
- **`schedule`** — dedupe venue-data lookups by the correct `venueId`.

## Upgrading checklist

1. **Read [the migration guide](./migration-6.0.0)** for the two breaking changes.
2. **Re-baseline any `considerGames: true` rating output** against the corrected normalisation.
3. **Migrate `person.birthdate` → `person.birthDate`** at every read and write site.
4. **Adopt the integrity queries at your own pace** — the hierarchy is purely additive; no action is required to keep existing code working.

## Where to go from here

| If you want…                                  | Read                                                                                |
| --------------------------------------------- | ----------------------------------------------------------------------------------- |
| The full upgrade walkthrough                  | [5.x to 6.0.0 migration](./migration-6.0.0)                                         |
| To audit a tournament for contradictory state | [Query Governor — integrity hierarchy](./governors/query-governor)                  |
| To report outstanding work before publishing  | The `*Completeness` companions in the [Query Governor](./governors/query-governor)  |
| Correct `considerGames` rating computation    | [generateDynamicRatings](./scale-engine/scale-engine-api#generatedynamicratings)    |
| Bulk-abandon still-playable matchUps          | [abandonTournamentMatchUps](./governors/matchup-governor#abandontournamentmatchups) |
