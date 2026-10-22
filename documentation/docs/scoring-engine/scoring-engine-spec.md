---
title: Scoring engine specification
---

The `ScoringEngine` keeps a CODES matchUp's score from the inputs a scorer gives it: points, games,
set totals, the end of a timed segment, a late-start baseline, a server correction and a
substitution. This page states the rules a second implementation has to reproduce without reading
the TypeScript: the inputs, the closed set of actions and the facts each carries, how a format
resolves to a rule for each set, each segment kind's rules, service, completion, what is refused,
and how a record is persisted and replayed. The questions this page first left open were decided by
CA on 2026-10-18; each rule now stands in the section it belongs to, marked "(CA 2026-10-18)", and
§ 16 keeps the record of each decision and of v1's divergence from it.

First version, 2026-10-18 (SE1 of the scoring-engine v2 plan), written from the rules first and the
source second: the conformance suite (79 matrix cells: 75 held by independent cases written from
rulebooks and format definitions, 4 refused), the engine tests the S1–S13 fixes added, the scoring
corpus (72 seeded streams) and probes run against factory `dev` at `0fcd079843`. Where v1 and a
rule disagree, this page states the rule and records v1's behaviour as **a v1 defect to fix before
cutover** (the differential of v1 against v2 surfaces each one); it does not encode a v1 accident as
the rule. A persisted record v1 wrote is still read as v1 read it (§ 12.8).

```text
state = reduce(configuration, timeline)

configuration   matchUpFormat → resolved segment rules · competitionFormat · pointMultipliers
timeline        point · game · set · endSegment · setInitialScore · setServer · substitution
                · challenge · annotation
reduce          § 3 format resolution → § 4–8 segment rules → § 9 completion, § 10 service
views           § 11 score, situation, points-to, scoreboard, episodes, statistics, events
```

**How rules cite their evidence.** A case is cited by its file and the `describe` title it sits under.
Conformance files live in `src/tests/scoring/conformance/` and are named without the
`.conformance.test.ts` suffix (`standardSets`, `tiebreakSets`, `tiebreakSetVariants`,
`advantageAndShortSets`, `timedSegments`, `aggregateSegments`, `combinedTotals`, `finalSegments`);
engine tests live in `src/tests/scoring/` and are named with their `.test.ts` file. Every conformance
case is held five ways by the harness (`src/tests/testHarness/scoringConformance/`): as played, in the
1-indexed `winningSide` spelling, mirrored (side 2 winning what side 1 won gives the mirror image),
through a correction round trip (undo everything, redo everything, re-enter the last point by
`editPoint`), and through a save, load and rebuild. A rule held by a conformance case therefore also
holds through replay. § 17 places every matrix cell under the sections whose rules score it; a gate
(`specCitesEveryCell.test.ts`) fails when a matrix cell is missing from this page.

## 1. Inputs: the configuration and the state

### 1.1 The configuration

An engine is built from:

- `matchUpFormat`: the format code (grammar: [matchUpFormat codes](/docs/codes/matchup-format)).
  Absent, it is `competitionFormat.matchUpFormat`, and absent that, `SET3-S:6/TB7`. A code that does
  not parse still builds an engine, and every scoring and service action is then refused (§ 2,
  CA 2026-10-18). v1 refuses only point input there and accepts the others: a v1 defect (§ 16, 10).
- `competitionFormat`: a profile. The engine reads its `serverRule` (§ 10.7), its `pointMultipliers`
  and its `substitutionRules` (§ 2.7). Its other profiles (penalties, timers, timeouts, players,
  point results) are returned to the host and change no score.
- `pointMultipliers`: conditional point values. The option wins over the profile's.
  A multiplier is `{ condition: { results?, strokes? }, value }`; the first whose `results` contains
  the point's `result`, or whose `strokes` contains its `stroke`, gives the point its value, and
  otherwise a point is worth 1.
- `isDoubles`, `matchUpId`: identity only.

A saved configuration loaded with the record replaces the constructor's (§ 12.6).

### 1.2 The state

The state is a CODES matchUp: `matchUpFormat`, `matchUpStatus`, `matchUpType`, two `sides`,
`score.sets[]`, `winningSide`, `history` and the side-level service orientation `serverFlip`.

- A new matchUp is `TO_BE_PLAYED` with no sets. The first accepted scoring input makes it
  `IN_PROGRESS`. Completion makes it `COMPLETED`, with `winningSide` when there is a winner and
  without one for a match that ended level with no declared decider (§ 7, § 9.7), and stamps
  `endTime`.
- A set records `side1Score`/`side2Score` (games, points or units, by segment kind),
  `side1TiebreakScore`/`side2TiebreakScore` when a tiebreak was played, `winningSide` when won, the
  per-game point counts `side1GameScores`/`side2GameScores` of the games played point by point, and
  engine marks: `isTiebreakOnly`, `isTimed`, `segmentComplete` (a timed segment closed, with or
  without a winner) and `currentStreak` (a consecutive-points game in progress; never in a set
  tiebreak, which no consecutive-points rule reaches, § 4.3).
- `history.points` holds the materialized points (§ 11.1); `history.entries` is the timeline
  (§ 12.1); `history.substitutions` mirrors the substitution entries; `history.initialServer` is the
  match's initial server, when one was named before anything was recorded (§ 2.6).

### 1.3 Sides

A side is named two ways: 0-indexed (`winner`, `server`: 0 is side 1) and 1-indexed (`winningSide`,
`serverSideNumber`: 1 is side 1). An input may use either spelling or both; both spellings must name
the same side (§ 2.1); both may be given when they agree. A materialized point carries both.

### 1.4 R2: calculated values are never inputs

**A value the engine calculates is never an input, and never recorded as one** (R2, decided
2026-10-17). The calculated point fields are `pointNumber`, `index`, `set`, `game`, `number`, `score`,
`pointsToGame`, `pointsToSet`, `pointsToMatch`, `gamesToSet`, `isBreakpoint`, `serveSide`, and the
1-indexed spellings `winningSide` and `serverSideNumber` (which are inputs only when the caller
supplied them). A caller that passes a calculated field has it overwritten on the point and left out
of the timeline, so the entry and the point cannot disagree (`publicBoundary.test.ts`, "a calculated
field passed as input is not recorded as one"). A server the engine derives, by the format (§ 10.1–10.4)
or by the competition's rule (§ 10.7), is calculated: it is a snapshot on the materialized point and a
rebuild derives it again (`replayLossless.test.ts`, "a calculated server is still not recorded as an
input (R2)"; `scoringAgreement.test.ts`, "a server the rule supplied is calculated").

## 2. The action set

The timeline is a closed set of nine action types. Each records only the facts its caller supplied.
Everything else the engine does is either a view (§ 11) or an edit of the timeline (§ 12.3–12.4).
The set is versioned: a later action (a correction event, a new annotation) is additive, not a format
change.

| action            | caller-supplied facts                                                                                                         | refused (an error; nothing is written)                                                                                                      |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `point`           | the winner; optionally the server, `serverParticipantId`, `scoreValue`, `timestamp`, `observedServeSide`, decorations (§ 2.1) | invalid sides or values (§ 2.1); a `scoreValue` other than 1 where a point is not a unit (§ 4.4, § 7); a segment that takes no points (§ 8) |
| `game`            | `winner` (0 or 1); optionally `tiebreakScore` `[side1, side2]`, `timestamp`                                                   | invalid facts (§ 2.2); a segment that takes no games: outs (§ 8), a combined total (§ 7)                                                    |
| `set`             | `side1Score`, `side2Score`; optionally tiebreak scores, `winningSide`, `timestamp`                                            | invalid facts; a `winningSide` the segment's rule contradicts (§ 2.3); an invalid combined total (§ 7)                                      |
| `endSegment`      | optionally `setNumber`, `timestamp`, `reason` (a free host string)                                                            | a segment that is not timed, a combined total among them (§ 2.4)                                                                            |
| `setInitialScore` | `sets[]`, optionally `currentSetScore`, `currentGameScore`, `server`                                                          | invalid facts; a second baseline once scoring entries exist (§ 2.5); a combined-total baseline that is invalid or has a game score (§ 7)    |
| `setServer`       | `side`, the side due to serve the next point                                                                                  | a side not 0 or 1 (§ 2.6)                                                                                                                   |
| `substitution`    | `sideNumber`, `outParticipantId`, `inParticipantId`, optionally `timestamp`                                                   | none throw; four identity refusals return a result instead (§ 2.7)                                                                          |
| `challenge`       | `sideNumber`; optionally host fields                                                                                          | a `sideNumber` not 1 or 2 (§ 2.8)                                                                                                           |
| `annotation`      | host data                                                                                                                     | none (§ 2.8)                                                                                                                                |

**Every action refuses invalid facts before anything is written, as `point` does** (CA 2026-10-18):
a side out of range, a score that is not a non-negative integer, a format that does not parse (for
every action that scores or names a server). v1 validates only `addPoint` and `editPoint` (S9):
`addGame({ winner: 2 })` scores for side 2, and `addSet`, `endSegment` and `setInitialScore` are not
validated, a v1 defect (§ 16, 10).

**A closed segment takes no input** (CA 2026-10-18): a point, game or set total aimed at a segment
that is closed is refused (§ 6.4). **A completed match takes no scoring input**: a point, a game and a
set total after `COMPLETED` are ignored alike, recording nothing and returning a result flag that says
so (CA 2026-10-18, one rule; § 9.6).

**A recorded action clears the redo stack; an action that changes nothing records nothing and keeps
it** (CA 2026-10-18; § 12.3). v1's `endSegment` keeps the redo stack and records an entry even when it
changes nothing: a v1 defect (§ 16, 1).

**Refusals apply at the action boundary only** (decided 2026-10-18): a persisted timeline that already
holds an entry v1 accepted and this page now refuses is replayed as v1 replayed it (§ 12.8).

### 2.1 point

**The facts.** The winner, in either spelling. Optionally the server in either spelling,
`serverParticipantId` (host metadata, recorded as given, never validated or derived), `scoreValue` (the
point's value where a segment counts points, § 5–6), `timestamp`, `observedServeSide` (`deuce` or `ad`,
recorded beside the expected `serveSide`), the flags `penaltyPoint`, `wrongSide`, `wrongServer`, and
any other field a host passes (`result`, `stroke`, `rallyLength`, `penaltyType`, annotations). Every
supplied field is recorded and replayed (`replayLossless.test.ts`, "S1: every recorded point input
survives a rebuild").

**Refused, before anything is written** (`publicBoundary.test.ts`, "S9: invalid input is refused before
anything is written"; `substitutionAndService.test.ts`, "S7: an observed court half is a recorded
input"; `inputLevels.test.ts`):

1. the format does not parse;
2. `winner` not 0 or 1, `winningSide` not 1 or 2, `server` not 0 or 1, `serverSideNumber` not 1 or 2;
3. the two spellings of the winner, or of the server, name different sides;
4. `scoreValue` negative or not finite (zero is allowed);
5. `observedServeSide` other than `deuce` or `ad`;
6. the set in play takes no point input (a segment of outs, § 8);
7. a `scoreValue` other than 1 where a point is not a unit: a segment whose points build games, and a
   combined total (§ 4.4, § 7; CA 2026-10-18);
8. the segment the point is aimed at is closed: a timed segment ended level with no declared tiebreak
   (§ 6.4; CA 2026-10-18).

**Ignored: accepted, and nothing is recorded** (no point, no entry, no event, the redo stack kept;
the result says it was ignored):

1. a point that names no winner (`aCompletedMatchTakesCorrections.test.ts`, "a point the scorer
   ignores records nothing");
2. a point after the match is `COMPLETED` (every conformance file: "a point after the match ends
   changes nothing"; the corpus's post-completion point in all 72 streams);
3. in a non-aggregate exactly-N format, a point after all N sets are closed (`tiebreakSets`,
   "HAL2X-S:TB11 — a level count of halves");
4. in a combined total, a point after the segment completes (`combinedTotals`, "a rally after the total
   changes nothing"). A point whose `scoreValue` is not 1 there is refused (rule 7), not ignored;
   v1 ignores it silently, a v1 defect (§ 16, 9).

### 2.2 game

Adds one game (or unit) to the open set for the side `winner` names, creating the next set when the
last one has a winner. A game in progress point by point is abandoned: its points stay on the
history, and the set's next point opens a new game at 0-0 (a game that wins the set opens none, as a
point that wins it opens none: SE2a-D3b, CA 2026-10-21) (`getEpisodesInterruptedGames.test.ts`,
"credits an interrupted game to no point"). A `tiebreakScore` is stored as the set's tiebreak points.
The set is then judged by its segment's rule (§ 4.2) and the match by § 9. In a timed segment a game
is a unit of its score (§ 6.2).

- **Refused** (CA 2026-10-18, § 2): `winner` not 0 or 1, a `tiebreakScore` that is not two
  non-negative integers, a format that does not parse, a closed segment (§ 6.4).
- **Ignored** after the match is `COMPLETED`, as a point is (§ 9.6).
- **In a tiebreak-only segment** a game is the segment won 1-0, with `tiebreakScore` as its points,
  checked against the race to n (§ 5).

v1 validates no field of a game, applies it to a match already `COMPLETED` and to a timed segment
already closed level, and counts a game in a tiebreak-only segment as one of its points: v1 defects
(§ 16, 4, 5, 10, 11).

### 2.3 set

**A set total is judged by its segment's rule** (CA 2026-10-18):

1. a total the rule calls finished is recorded with the winner the rule gives it (6-4, 7-6 with a
   tiebreak, 7-5; for outs the side with more);
2. an explicit `winningSide` that contradicts the rule is refused: one naming the loser of a total the
   rule calls finished (6-4 given to side 2), or a side that is behind. On a total the rule does not
   call finished, an explicit `winningSide` for the side ahead is accepted: it is a set-level mercy or
   manual end (§ 2.4);
3. a total the rule does not call finished, given with no winner, is recorded as the set in play, open
   (3-1 in a set to six), not refused: the courthive-components inline scorer ignores refusals, so a
   refusal would lose the input. In a tiebreak-only segment that total is the race's running points,
   the game in play (§ 5 rule 1), as a baseline reads it: `SET3-S:TB11` 11-10 is `[0, 0]` with the game
   in play at 11-10, and the next point plays on from it (SE2a-D13, CA 2026-10-21);
4. a timed segment's total is a finished segment: the side with more wins it, and a level one follows
   § 9.7 (or its declared tiebreak, § 6.4).

**A total entered while a set is in play closes that set** (CA 2026-10-18): a scorer who scored part
of a set point by point or game by game, then lost track, declares the set's total and keeps scoring.
The open set takes the declared total and its winner, judged by the rules above; the points and games
already recorded in it stay on the history; scoring continues in the next set. Mixed entry (games then
points, points then a total) behaves the same way (`aSetTotalClosesTheSetInPlay.test.ts`). Undoing the
total restores the set as it was. v1 appended the total as a new set beside the open one.

A set with a winner triggers § 9. This is the only input a segment of outs takes (§ 8). In a
combined total the set is the one segment, validated by § 7. **No set beyond N** in an exactly format:
a set total after the N sets, like one after `COMPLETED`, is ignored (§ 9.2, § 9.6).

v1 infers a winner from any unequal total, whether or not the segment's rule would call the set
finished (`SET3-S:6/TB7`: 3-1 and 2-0 complete the match), and records sets after the match is
complete and past N in an exactly format: v1 defects (§ 16, 5, 6, 7).

### 2.4 endSegment

**`endSegment` ends timed segments only** (CA 2026-10-18): the timed segment in play, or the one
`setNumber` names, by § 6.4. It is refused on any other segment kind, and when there is no timed segment
to end. Other ways to stop are not this action:

- a set-level mercy or manual end is `addSet` with an explicit `winningSide` (§ 2.3);
- a match-level stop is a `matchUpStatus` (`RETIRED`, `ABANDONED`, `DEFAULTED`), set outside scoring.

`reason` is a free host string, recorded and never interpreted (epixodic sends `bolt_expired`); the
type widens from `'time' | 'mercy' | 'manual'` to `string`. v1 accepts `endSegment` on any segment kind
(closing a `SET3-S:6/TB7` set at 2-1, and a `SET3-S:TB11` set at 5-3 as level 0-0): a v1 defect
(§ 16, 2). A persisted non-timed `endSegment` entry replays as v1 replayed it (§ 12.8).

### 2.5 setInitialScore

A late-start baseline: the sets already played (each with its winner, or one inferred), the set in
play's games, and the game in play's points. It replaces the score as it stands and makes the matchUp
`IN_PROGRESS`. It is a timeline action: a rebuild replays it where it was set, it survives `setState`
alone, and `undo` removes it (`replayLossless.test.ts`, "S2: a late-start baseline survives reload and
is part of the timeline").

**The baseline's rules** (CA 2026-10-18):

1. Its sets are judged by their segment rule, as `addSet` judges a total (§ 2.3): 6-5 is not won; the
   final set is the one the deciding-set rule of § 3.2 names, read from the score; a tiebreak-only set
   is read from its points (1-0 with 11-9 is won).
2. A baseline that decides the match completes it (6-0 6-0 in a best of three is `COMPLETED`).
3. An unfinished last set is the set in play. In a tiebreak-only segment its total is the race in play,
   so a `currentGameScore` given beside it names that race's points twice and is refused (SE2a-D14, CA
   2026-10-21: the cleaner rule). A stored baseline v1 took so replays as v1 replayed it, from the
   total, flagged as a legacy shape (§ 12.8).
4. A supplied `server` is honoured: it is recorded as a `setServer` at the baseline's position
   (§ 10.6).
5. A second baseline is refused once the timeline holds scoring entries; a correction uses
   `editPoint`/`removePoint` or `undo` (§ 12.3–12.4).
6. `matchUpStatus` and `winningSide` given beside the sets are checked for consistency with them, and
   refused only when they disagree, not as unknown fields.

v1 judges a set won when it "reached setTo and ahead" (so 6-5 is won), reads the final set by position,
never infers a tiebreak-only set, does not complete a decided match, lets a second baseline replace the
whole score (including games scored since) and ignores `server`: v1 defects (§ 16, 8).

### 2.6 setServer

Names the side due to serve the next point; § 10.6 states what it does to the derivation. A side not
0 or 1 is refused (§ 2).

**A server correction survives undo and rebuild** (CA 2026-10-18). With `recordEntry: false` it is not
an action of its own: it is recorded **attached to the preceding entry**, replayed with it, and undone
with it, so undoing that point removes the correction too. **With nothing before it** it is the match's
**initial server** (CA 2026-10-21, SE3-E1): kept on the record as `history.initialServer`, not on the
timeline, so every rebuild and reload starts from it, and `reset` clears it. v1 changed the orientation
without a record, and the next rebuild lost it (`SET3-S:6/TB7`: servers 1, 1, then after one undo the surviving point's
server is 0); INTENNSE re-applies it after every point and still shows the wrong server after an undo:
a live v1 defect (§ 16, 16).

### 2.7 substitution and the advisory rules (S6)

Replaces `outParticipantId` with `inParticipantId` in the side's lineUp, from the next point on.
Points already played keep the players recorded on them (§ 11.1). Refused with a result, recording
nothing and keeping the redo stack: `SAME_PARTICIPANT`, `NO_LINEUP` (the side has none),
`OUT_NOT_ON_SIDE`, `IN_ALREADY_ON_COURT` (on either side). A history recorded before these refusals
replays as it was (`substitutionAndService.test.ts`, "S6: substitute checks who is on court and says
what it did").

**The competition's substitution rules are advisory** (CA 2026-10-17). A substitution is never refused
by them: a required substitution (a player out of time, a penalty removal) is the host's to allow.
`evaluateSubstitution()` reports what a substitution made now would break: `NOT_ALLOWED`
(`allowed: false`), `MAX_PER_MATCHUP`, `MAX_PER_SEGMENT` (counted in the set in play; an event recorded
before `setNumber` existed is placed by the point it preceded), `TIMING` (`BETWEEN_GAMES` while a game
has points in it), and `MATCHUP_TYPE`. Roster sizes and other timings are not reported
(`substitutionAndService.test.ts`, "S6: the competition rules are advisory").

### 2.8 challenge and annotation

**Challenges and annotations are versioned timeline actions that change no score** (CA 2026-10-18).
A `challenge` records the side that challenged (`sideNumber`) and any host fields; an `annotation`
records host data. Neither changes the score, the server or any view of the score; both are replayed
in place and kept through every rebuild. **`undo` takes back whatever was recorded last**, a challenge
or an annotation included: it does not skip them (CA 2026-10-18). v2 reads v1's raw entries,
`{ type: 'challenge', data: { sideNumber } }` as epixodic writes them (#404(epixodic)), unchanged, as
`challenge` actions (§ 12.6). v1 has no such action: the host writes the entry itself, a rebuild keeps
it without replaying it, and `undo` pops it, which is already the rule.

### 2.9 What is not an action

- **Corrections** are edits of the timeline, not new actions: `editPoint`, `removePoint`,
  `decoratePoint` (§ 12.4), and `undo`/`redo` (§ 12.3).
- **`setLineUp`** sets a side's lineUp and its initial snapshot, outside the timeline.
- **`reset`** starts a new matchUp with the same format and identity: no history, no redo, no lineUps.
- **`markHardBoundary`** is a deprecated annotation, removed at the next major; a rebuild discards it
  (`inputLevels.test.ts`, "S8: a hard boundary is an annotation").
- **A match-level stop** (`RETIRED`, `ABANDONED`, `DEFAULTED`) is a `matchUpStatus`, not a scoring
  action (§ 2.4).

## 3. Format resolution: the rule for set n

### 3.1 The match

- **Best of N** (`SET3`, `MAP5`, …): the first side to win a majority of N sets, ⌊N/2⌋ + 1, wins (for odd N
  that is ⌈N/2⌉; an even N can end level, § 9.7; SE2a-D7, CA 2026-10-21). `SET1X` and `SET1XA` read as
  best of one (exactly one set is best of one).
- **Exactly N** (`X`): all N sets are played; a lead is not a win (§ 9.2).
- **Aggregate** (`A`): every set is played and the total across them decides; sets won are not
  consulted (§ 9.3). With `X` it is exactly N plus a decider (§ 9.4).
- **Standalone** (`T{minutes}`, `T{minutes}P`): one timed segment, best of one.

### 3.2 Which format governs a set

The ordinary format (`-S:`) governs every set except the one the final-segment format (`-F:`) governs:

1. **best of N**: the set played with both sides one set from winning (the deciding set), read from
   the score, **and set N whatever the count when it starts** (CA 2026-10-18): a timed segment closed
   level wins no set, so `SET3-S:T10-F:T10/TB7` can reach set three at one set to love, and set three
   still plays its declared `/TB7` (`timedSegments`, "the final set is set N"). v1 read the score only;
2. **exactly N, not aggregate**: set N, by number, whatever the count before it
   (`timedSegments`, "SET4X-S:T20P-F:T20 — the fourth segment is scored in games … and must be played");
3. **exactly N, aggregate**: set N + 1, the decider, and never one of the N (§ 9.4;
   `aggregateSegments`, "the -F: format does not govern set three").

Every rule below, and **every view** (§ 11), reads the format governing the set in play and the
match's completion rule (CA 2026-10-18). Scoring, the score situation, points-to, the scoreboard, server
derivation, the events and the input levels must agree on it: one predicate decides whether a standard
set is in its tiebreak (`tiebreakServiceOrder.test.ts`, "isStandardSetTiebreak";
`noTiebreakIsNoTiebreak.test.ts`). v1's scoreboard reads the ordinary format instead: a v1 defect
(§ 16, 13).

### 3.3 Segment kinds

A set format is exactly one kind, recognised in this order:

| kind           | written                                  | point | game | set | rules |
| -------------- | ---------------------------------------- | ----- | ---- | --- | ----- |
| combined total | `P{n}`, `P{n}DP`, `P{n}WB{m}`            | yes   | no   | yes | § 7   |
| outs           | `O{n}`                                   | no    | no   | yes | § 8   |
| timed          | `T{minutes}[P\|G][/TB{n}][@{modifier}]`  | yes   | yes  | yes | § 6   |
| tiebreak-only  | `TB{n}[NOAD][@RALLY]`                    | yes   | yes  | yes | § 5   |
| standard       | `{setTo}[NOAD][WB{n}][/TB{n}[NOAD]][@N]` | yes   | yes  | yes | § 4   |

The input levels are reported by `getInputLevels()` for the set in play, and `addPoint` and `addGame`
refuse what it reports unavailable (S4; `inputLevels.test.ts`). **A parser-valid format is not a
promise of a point model**: a kind with no point model refuses point input rather than scoring it as
another sport.

### 3.4 Roots, modifiers and the clock

- **The root changes nothing about a set's rules**, with one exception: whether points build games in a
  timed set (§ 6.2). `FRM7-S:TB11` scores as `SET7-S:TB11`, and `INN3X-S:6/TB7`'s sets take their
  tiebreak at six all (`tiebreakSets`, "FRM7-S:TB11"; `timedSegments`, "exactly | INN | standard(tiebreak)").
- **An unknown match modifier is kept, not scored**: `SET3Z-S:6/TB7` plays as `SET3-S:6/TB7`
  (`finalSegments`, "unknownModifiers").
- **A match clock (`-M:T{minutes}`) is the host's to keep** and changes no scoring (`standardSets`,
  "-M:T60 — a match clock is the host’s to keep"). So is a timed segment's clock: only `endSegment`
  closes one.

### 3.5 The game format

`-G:` is match-level and governs every game built from points in every segment:

- `-G:TN` (or absent): a traditional game (§ 4.1).
- `-G:TN{n}D`: a traditional game whose n-th deuce is decided by the next point (§ 4.1).
- `-G:{n}C`: a game won by the first side to win n points in a row (§ 4.1).

It never governs a tiebreak (§ 4.3, § 5). **In a timed set whose points build games** (§ 6.2 rule 2)
the games are of the declared game format, a consecutive-points format included (CA 2026-10-18); v1
builds traditional games there, a v1 defect (§ 16, 19).

## 4. Standard sets

### 4.1 The game

A game is played point by point to one of these rules (Rules of Tennis, Rule 5; Appendix VI):

1. **Traditional**: the first side to four points, two clear; from 40-40 a side needs two points in
   a row (`standardSets`, "Rule 5: from deuce a game needs two consecutive points").
2. **No-Ad** (`NOAD` on the set): at 40-40 the next point wins the game (`advantageAndShortSets`,
   "SET3-S:6NOAD"). No-Ad changes the game, never the set's margin or the tiebreak
   (`tiebreakSetVariants`, "No-Ad games do not make it sudden death").
3. **Deuce cap** `TN{n}D`: deuce k is k + 2 points all; from the n-th deuce the next point wins the game,
   and before it an advantage converted wins as usual. `TN1D` is a golden point at the first deuce;
   `TN3D` is padel's star point (`tiebreakSetVariants`, "the star point").
4. **Consecutive** `{n}C`: the first side to win n points in a row wins the game; a point to the other
   side starts the run again, and alternating points never finish a game (`advantageAndShortSets`,
   "TYPTI").

### 4.2 The set

With `setTo` S, margin W (`WB{n}`, default 2) and, when declared, a tiebreak at T games all (`@T`,
default S):

1. **Without a tiebreak** (an advantage set): the first side to S games with a lead of W wins the set;
   there is no tiebreak at any score (`advantageAndShortSets`, "an advantage set plays on past six all";
   `noTiebreakIsNoTiebreak.test.ts`). `WB1` is first to S outright (`advantageAndShortSets`,
   "win-by-one sets"). The grammar refuses `WB` beside a tiebreak.
2. **With a tiebreak**: at T games all a tiebreak game is played, and its winner takes the set by
   T + 1 to T. Otherwise the first side to S games with a lead of two wins the set: 6-4, and 7-5 from
   6-5 (`standardSets`, "Rule 6: at 6-5 there is no tie-break; 7-5 wins the set").
3. **An early tiebreak** (T < S): at T all the tiebreak decides; `SET3-S:4/TB5@3` is 4-2 or 4-3
   (`tiebreakSetVariants`, "short sets, tie-break at three all"). **A late tiebreak** (T > S): from S all
   the set plays on as an advantage set until T all (`tiebreakSetVariants`, "a late tie-break").
4. **The one-game set** (`S:1/TB7`): Rule 6 at S = 1. One game won is not a set without a margin of
   two; 2-0 is; at one game all the declared tiebreak decides, 2-1 (CA 2026-10-17: "Rule 6: margin of
   two"; `tiebreakSetVariants`, "the one-game set by Rule 6").

**A tiebreak below S − 1** (`@T` with T < S − 1) is refused at validation for a new format
(CA 2026-10-18): the set would close below S without a tiebreak. v1's rule ("a side has T + 1 games")
is the rule only when T ≥ S − 1; a persisted format with such a tiebreak replays by v1's rule
(§ 12.8). v1's grammar accepts the code: a v1 change (§ 16, 19).

### 4.3 The tiebreak game

A tiebreak to n is won by the first side to n points with the tiebreak margin: **one when it is No-Ad
(`TB{n}NOAD`) or when its target is one (`TB1`, sudden death, CA 2026-10-17), two otherwise** (Rule
5(b); `tiebreakMargin.test.ts`). One rule decides the margin for scoring, points-to, score entry and
the validators. It is scored point by point whatever the game format: a deuce cap or a
consecutive-points game does not reach it (`tiebreakSetVariants`, "the cap governs games, not the
tie-break"; "the tie-break at four all scores point by point"). It is recorded on the set as one more
game for its winner plus both sides' tiebreak points: `[7, 6, [7, 0]]`.

### 4.4 Point values

**A `scoreValue` other than 1 is refused where a point is not a unit** (CA 2026-10-18): in a segment
whose points build games, a point is one point of a game. A configured multiplier applies only to a
segment scored in units (§ 5 rule 5, § 6.2 rules 1 and 3); in a game-building segment it is not
consulted. v1 records the value on the point and ignores it (`SET3-S:6/TB7`: two points of value 2 are
30-0): a v1 defect (§ 16, 9).

### 4.5 The final set

The final-set format replaces the ordinary one in the set § 3.2 names and is scored by its own kind:
an advantage final set (`-F:6`), a final tiebreak to ten (`-F:6/TB10`), a late final tiebreak
(`-F:6/TB7@12`), a match tiebreak in lieu of the final set (`-F:TB10`, § 5), a sudden-death one
(`-F:TB10NOAD`), a timed final (`-F:T20`, `-F:T20P`, § 6) and a final of outs (`-F:O3`, § 8)
(`standardSets`, "final sets that differ from the ordinary set"; `finalSegments`). A match won before
the final set never consults its format (`tiebreakSets`, "the final-set format is never reached").

## 5. Tiebreak-only segments

A tiebreak-only set (`S:TB{n}`, or `F:TB{n}` as a match tiebreak) is one game: a race to n points with
the tiebreak margin of § 4.3. It is how pickleball, squash, table tennis, badminton, volleyball and
esports maps write a game.

1. **While in play** the set records no game won (`[0, 0]`); its running points are the game in play
   (`side1GameScores`/`side2GameScores`), not tiebreak points.
2. **Won**, it records a game won 1-0 and its points as tiebreak points: 11-9 is `[1, 0, [11, 9]]`
   (CODES; `tiebreakSets`, how a tiebreak-only set is recorded).
3. **Every point given counts.** The engine does not model side-out: without `@RALLY` it scores every
   point it is given (decided 2026-10-17), and a host recording side-out pickleball adds only the
   points the serving side won (`tiebreakSets`, "every point given counts"; § 13).
4. **`@RALLY`** changes service only (§ 10.4): every rally scores whoever served, which is already rule 3.
5. **A point's value counts**: a point adds its `scoreValue`, or its multiplier's value, or 1.

The race to n is pinned for USA Pickleball Rule 4, World Squash Rule 2, ITTF Laws 2.11–2.12, BWF Law 7
(the 30-point cap is not expressible in `TB21`), FIVB Rule 6 and VALORANT maps (`tiebreakSets`).
**A game given as game input** in a tiebreak-only segment is the segment won 1-0, with `tiebreakScore`
as its points, checked against the race to n (11-9 is accepted for `TB11`, 11-10 is refused); the
input levels keep offering game there (CA 2026-10-18). v1 adds one point toward the target, so
`SET3-S:TB11` needs eleven `addGame` calls for a set: a v1 defect (§ 16, 11).

## 6. Timed segments

### 6.1 No target: time closes a segment

A timed segment (`T{minutes}`) has no game or point target. Points and games accumulate and never
close it; only `endSegment` does (`timedSegments`, "a timed set has no game target"). The clock is the
host's (§ 3.4).

### 6.2 What a point builds

1. **Points-based** (`T{minutes}P`): a point adds its value (its `scoreValue`, or its multiplier's
   value, or 1) to its side's segment score.
2. **Games-based under the SET root, not aggregate, not standalone** (`SET3-S:T10`,
   `SET3-S:T10-G:TN3D`): a tennis-family timed set. Points build traditional games by the match's game
   format (§ 3.5), and the segment counts games (CA 2026-10-17: "Points build games";
   `timedSegments`, "timed sets: games from points"). A point's value does not apply (§ 4.4).
3. **Games-based anywhere else**: under another root (`HAL2A-S:T45`, `QTR4A-S:T12`), standalone
   (`T90`), or in an aggregate format (`SET2XA-S:T10`), a point is one of the sport's own units (a goal,
   a basket, an INTENNSE bolt's point) and adds its value to the segment score.

A game given as game input adds one game (rule 2) or one unit (rules 1 and 3).

### 6.3 Modifiers

`@RALLY` on a timed segment changes no scoring: every point already scores (`timedSegments`,
"SET3-S:T20@RALLY").

### 6.4 The end of a segment

`endSegment` closes the segment in play:

1. **One side ahead**: that side wins the segment (`timedSegments`, "when time is up the side with more
   games wins the segment").
2. **Level, with a declared tiebreak** (`T{minutes}/TB{n}`, "a tiebreak if level at time"): the segment
   stays open and a tiebreak to n with the margin of § 4.3 is played; points go to it, `endSegment`
   during it is ignored, and its winner takes the segment by one more game (or point, or unit), with the
   tiebreak points recorded: level 1-1 and won 7-0 is `[2, 1, [7, 0]]` (CA 2026-10-17: "Play the
   tiebreak"; `timedSegments`, "level at time, a tiebreak to seven decides the segment";
   `timedSetTiebreak.test.ts`). `TB1` is one sudden-death point.
3. **Level, with no tiebreak**: the segment is closed without a winner. In an aggregate format its total
   still counts (§ 9.3). Elsewhere a level segment is played and counts toward the sets played, and the
   match follows § 9.7: no segment the format did not declare is played after it (CA 2026-10-18).

**A closed segment takes no input** (CA 2026-10-18): a point, game or set total aimed at it is refused,
and a second `endSegment` on it is refused. v1's `addGame` ignores the closed mark, adds to the level
segment and lets `endSegment` re-close it with a winner (`SET3-S:T10`: games 1-1, end, game, end gives
set one 2-1): a v1 defect (§ 16, 4).

Ahead at time, a segment that declares a tiebreak plays none (`timedSegments`, `T{minutes}P/TB{points}`).

### 6.5 Recorded shape

A timed set carries `isTimed`, its score in games or units, and `segmentComplete` once closed. A
tiebreak at time adds tiebreak points as § 4.3 records them.

## 7. Combined totals

`SET1-S:P{n}` is one segment of rally points that ends when both sides' points total n (Americano,
Mexicano). The grammar admits it only as the single segment of a SET-root best of one, with no final,
game format, modifier or clock.

1. **A rally adds one point** to its winner. A `scoreValue` other than 1 is refused (CA 2026-10-18,
   § 2.1); v1 ignores such a point silently, a v1 defect (§ 16, 9).
2. **Below n** the segment is open. **At n**, an unequal result is complete with a winner, under every
   variant (`combinedTotals`, "an unequal result at 32 rallies is complete with a winner").
3. **A tie at n** (only an even n can tie):
   - `P{n}` (ALLOW): complete, with no winner. The matchUp is `COMPLETED` without `winningSide`, and
     `onMatchTie` fires instead of `onMatchComplete` (`combinedTotals`, "16–16 is a completed tie
     without a winner").
   - `P{n}DP`: one deciding rally (`combinedTotals`, "a tie takes one deciding rally").
   - `P{n}WB{m}`: play continues until a lead of exactly m (`combinedTotals`, "a tie plays on to a
     two-point margin").
4. **After completion** a rally changes nothing (§ 2.1).
5. **Input levels**: points and the segment's total (`addSet`, validated, one segment only); never a
   game, never `endSegment`. A baseline (`setInitialScore`) is validated the same way and has no game
   score (`combinedTotals`, "input levels").
6. **Service**: none is derived; supply the server (§ 10.4).

A total that no play can reach is invalid: above n is reachable only from an even tie, at most one
rally past it for `DP`, and never past a lead of m for `WB{m}`.

## 8. Outs: refused

A segment of outs (`O{n}`: innings, halves) has no point or game model here. **Point and game input is
refused, before anything is written; it is scored with set totals** (`addSet`: an inning's runs), the
side with more winning the set (S4, #5518). A final set of outs refuses points only once it is the set
in play: the ordinary sets before it score by the point (`finalSegments`, "a final set of outs refuses
points only once it is the set in play"; `inputLevels.test.ts`). The four refused matrix cells are held
by the matrix gate itself, which checks every harvested code in them refuses point and game input
(`formatMatrix.test.ts`, "a refused cell refuses point and game input"). A match clock on an outs
format is parsed and not enforced (§ 3.4).

## 9. Completion

### 9.1 Best of N

The match is won by the first side to win a majority of the N sets, ⌊N/2⌋ + 1 (Rule 7; `standardSets`,
"Rule 7"; SE2a-D7: ⌈N/2⌉ read for an even N would be half, which § 9.7 rule 4 contradicts). A set without
a winner (a timed segment closed level) is played and counts for neither side. **No set beyond N is
played**: when all N sets are played and neither side has a majority, the side with more sets wins, and a
level count ends the match by § 9.7 (CA 2026-10-18). v1 opens another set after a level timed segment,
so `SET1-S:T10P` level at time takes a second set and a `SET3-S:T10` can need a fourth: a v1 defect
(§ 16, 3).

### 9.2 Exactly N, not aggregate

1. Reaching a majority of sets before all N are played is a lead, not a win (`tiebreakSets`, "in HAL3X a
   two-halves lead is not a win"; `timedSegments`, "exactly | timed").
2. Once all N sets are played, the side with more sets wins, however many it took; a sweep is a win
   (`tiebreakSets`, "a sweep included").
3. A level count names no winner (fixed 2026-10-17, #5529: v1 named side 1; `tiebreakSets`,
   "a level count of halves names no winner"), and **the match is `COMPLETED` without a winner** unless
   a decider is declared (§ 9.7; CA 2026-10-18). A set closed level counts toward the N played. The
   suite pins a level `HAL2X-S:TB11` as not complete: that pin changes with v1 (§ 16, 18).
4. **No set beyond N**: a point after N closed sets is ignored (`tiebreakSets`, "no half beyond N is
   recorded"), and so is a game or a set total (CA 2026-10-18). v1 records a set total past N
   (`HAL2X-S:TB11` takes three `addSet` halves and completes 2-1): a v1 defect (§ 16, 7).

### 9.3 Aggregate

1. Every one of the N segments is played (exactly N, or N of a best of N). A lead in segments or in
   total is not a win (`aggregateSegments`, "a big first-half lead is not a win").
2. **The total decides; sets won are not consulted** (`aggregateSegments`, "winning three quarters of
   four is not consulted"; `tiebreakSets`, "SET3A-S:TB11 — aggregate").
3. A segment's total is its units: a timed segment's own score (games or points, including the unit a
   tiebreak at time added), and a tiebreak-only segment's points.
4. An unequal total after N segments wins. A level total names no winner (`aggregateSegments`, "a level
   total names no winner"); with no declared decider the match is `COMPLETED` without a winner, and
   no further segment is played (§ 9.7; CA 2026-10-18). v1 plays further segments of the ordinary
   format until the totals differ (`SET3A-S:TB11` level 24-24 takes a fourth game; `HAL2A-S:T45` a
   third half; an `XA` format without `-F:` the same at set N + 1): a v1 defect (§ 16, 12).
5. **An aggregate of standard sets is refused at validation** (SET3A-S:6/TB7, QTR4A-S:6/TB7; CA
   2026-10-18; written as plain text, since the conformance matrix harvests every code the scoring
   docs put in code formatting as a format to score): aggregation is defined over timed and
   tiebreak-only segments, whose scores are units. v1 sums the tiebreak points of a set that had a tiebreak and its games otherwise; a persisted
   record with such a format replays by v1's rule (§ 12.8). The courthive-components format editor's
   Aggregate toggle is restricted to timed and tiebreak-only sets in the same change
   (`courthive-components/src/components/matchUpFormat/matchUpFormat.ts:422-428`,
   `machine/edits.ts:107-109`; tests `__tests__/modalStateMachine.test.ts:151`,
   `__tests__/formatMachine.test.ts:221`).

### 9.4 The aggregate decider

In an exactly-N aggregate format the final-segment format (`-F:`) is the **decider, set N + 1**, played
only when the N totals are level, and never one of the N (CA 2026-10-04, the INTENNSE format;
`aggregateDeciderIsSetNPlusOne.test.ts`; `aggregateSegments`, "-F:TB1 settles a level total"):

1. an unequal total after N needs no decider, and nothing past set N is recorded;
2. `-F:TB1` (and `-F:TB1NOAD`) is one sudden-death point: `[0, 1, [0, 1]]` (CA 2026-10-17: "TB1 is
   sudden death"; `aggregateSegments`, "the sudden-death decider of a level aggregate");
3. a timed decider (`-F:T10P`) is ended by `endSegment`, and the side ahead wins the match
   (`aggregateSegments`, "the -F: decider is set four, timed and points-based").

### 9.5 Combined totals

§ 7: complete at the total, with a winner or as a tie.

### 9.6 After completion

**A completed match takes no scoring input** (CA 2026-10-18, one rule): a point, a game and a set total
after `COMPLETED` are ignored alike, recording nothing, keeping the redo stack and returning a result
flag that says the input was ignored (§ 2.1; the corpus pins the point). v1 applies set and game input
to a completed match (`SET3-S:6/TB7` 6-0 6-0 takes a third set by `addSet` and a fourth by `addGame`):
a v1 defect (§ 16, 5). Corrections stay available: a completed match takes `editPoint` and
`decoratePoint` (`aCompletedMatchTakesCorrections.test.ts`, "a completed match takes per-point
corrections").

### 9.7 A match that ends level

**A timed, aggregate or exactly-N match that ends level with no declared decider is `COMPLETED` with
no `winningSide`**, and `onMatchTie` fires, as for a combined-total tie (§ 7) (CA 2026-10-18).

1. **The engine never plays a segment the format did not declare**: no fourth set in a best of three,
   no play-on in an aggregate, no set N + 1 in an exactly format (an exactly-N aggregate's declared
   `-F:` decider excepted, § 9.4).
2. **A decider exists only when declared**: a tiebreak on the timed segment (`T{minutes}/TB{n}`, § 6.4,
   in the ordinary or the final format), or, in an exactly-N aggregate, the final-segment format
   (`-F:`, § 9.4). In an exactly-N format that is not aggregate `-F:` is set N (§ 3.2), not a decider.
3. **The views say a decision is required**: `decisionRequired` is true on a match `COMPLETED` without
   a winner (§ 11.2), so a host running an elimination draw knows to ask for a decision. The scoring
   engine records none; the decision is the host's (a `matchUpStatus` and `winningSide` set outside
   scoring).
4. **The elimination guard** (CA 2026-10-18: "yes, extend the check"). `formatCanEndTied`
   (`src/validators/tiedFormatCompatibility.ts`), checked at draw generation and by
   `checkDrawFormatCompatibility`, today reports only a `P{n}` combined total that can tie, so only that
   is refused in a structure that advances a winner. It extends to every format that can end level by this rule: timed,
   aggregate and exactly-N formats with no declared decider; a best-of format with an even N (CA 2026-10-18:
   `SET2-S:6/TB7` can end 1-1); and a format whose only decider can itself end level (CA 2026-10-18: a timed `-F:`
   with no `/TB`, as in `SET3XA-S:T10-F:T10P`, is not a decider). A real decider is untimed (`-F:TB1`, `-F:TB10`)
   or timed with a tiebreak (`-F:T10P/TB1`). Only a format CHANGE is refused, so a stored draw is untouched and a
   score submitted with the matchUp's existing format is accepted; TEAM structures are skipped (the tieFormat
   decides the dual). A policy may still offer such a format for round robin and team play (CA 2026-10-18:
   `POLICY_SCORING_USTA`'s `SET1-S:T20` stays as it is). This is a v1 change (§ 16, 3).

v1 opens further segments after a level timed segment and after a level aggregate, and keeps a level
exactly-N match `IN_PROGRESS`: v1 defects (§ 16, 3, 12, 18). Entries v1 recorded past a level close
replay as v1 replayed them (§ 12.8).

## 10. Service

The server is **side-level**. The engine derives the side due to serve the next point, records it on
the point as a calculated snapshot unless the caller supplied one (R2, § 1.4), and corrects the
derivation only when told to (`setServer`). A server supplied on one point is recorded as played and
does not change the derivation of later points, except as the orientation of § 10.6.

### 10.1 Standard sets

1. **Game by game**: side 1 serves the first game of the match, and the server alternates every game,
   counted across every set and however a game was recorded (by points, `addGame`, `addSet` or a
   baseline) (`standardSets`, "service alternates game by game").
2. **The tiebreak** (Rule 5(b)): the side due to serve the next game opens it and serves one point; then
   each side serves two in turn: for an opener o and k points played, the server is
   (o + ⌊(k + 1)/2⌋) mod 2, giving 0, 1, 1, 0, 0, 1, 1, … for opener 0. The tiebreak counts as one game,
   so its opener receives first in the next set (`tiebreakServiceOrder.test.ts`, "tiebreak service order
   (ITF Rule 5(b))", including a final-set tiebreak at another games-all and an ordinary-set tiebreak
   when the final set has none; S3 and R1, #5512).

### 10.2 Tiebreak-only segments and match tiebreaks

1. **A tennis match tiebreak** (`-F:TB{n}` after standard sets) keeps Rule 5(b): the opener is the side
   due to serve by the games of the sets before it, and within the set the rotation of § 10.1 applies
   (`tiebreakServiceOrder.test.ts`, "a match tiebreak in lieu of the final set").
2. **A tiebreak-only format** (`S:TB{n}`: squash, table tennis, pickleball and badminton shapes)
   **derives no server** until each sport's own rule is added (CA 2026-10-18; Mentat TASKS, "research:
   each sport's service rule for the scoring engine"). A point records the server only when the caller
   supplies it, as under `@RALLY` (§ 10.4), and the server-based statistics (S/R, break points) are not
   produced (§ 10.8, § 11.3).

v1 applies tennis's Rule 5(b) rotation, the S/R code and break points to every tiebreak-only set
(`SET5-S:TB11` squash, `SET7-S:TB11` table tennis; `tiebreakServiceOrder.test.ts`, "a standalone
tiebreak set, both opening servers"): a v1 change (§ 16, 17).

### 10.3 Timed segments

**Service alternates by unit, continuously across segments** (CA 2026-10-18): game by game where points
build games (§ 6.2 rule 2), point by point otherwise, and a new segment's first unit is served by the
side that did not serve the last unit of the segment before, as games run on across sets (§ 10.1).
**A tiebreak at time follows Rule 5(b)** (§ 10.1 rule 2), opened by the side due to serve the next
unit. **A timed aggregate segment takes the aggregate court-half rule** (§ 10.5). v1 opens each new
segment from the closed segment's count (`SET3-S:T10P` serves 0, 1, 0 in segment one and 1, 1 in
segment two) and plays the tiebreak at time with no rotation (`SET3-S:T20/TB7`: 0, 0, 0, 0): v1 defects
(§ 16, 14).

### 10.4 Rally scoring and combined totals

**Under `@RALLY` the rally winner serves next** (CA 2026-10-18): the server of a point is the winner
of the point before it, as under `WINNER_SERVES` (§ 10.7); the first point's server follows the
orientation (§ 10.6). **In a combined total `P{n}` no server is derived**: a point records the server
only when the caller supplies it, and its S/R code is not derived. Nor in a tiebreak-only format
without `@RALLY` (§ 10.2).

**Whether the server is derived is its own indicator** (CA 2026-10-18). `getNextServer()` keeps
returning 0 or 1 for API compatibility (epixodic computes `1 - getNextServer()`); `isServerDerived()`,
and `serverDerived` in the score situation (§ 11.2), say whether that answer is the engine's
derivation or only a placeholder. The placeholder is the side the last `setServer` named, and side 1
without one. **A completed match derives no server** (CA 2026-10-21): it has no next point, so
`isServerDerived()` is `false`, and `getNextServer()` still answers the side the rotation would give. Under `@RALLY` a `setServer` names the server of the next point only, and the rule resumes
after it, as a supplied server does under `WINNER_SERVES`. v1 derives no server under `@RALLY` and answers a side anyway
(`SET3-S:TB11@RALLY` after two points: 1), with no indicator: a v1 defect (§ 16, 15).

### 10.5 The court half

The expected court half (`serveSide`) is derived from the score before the point: `deuce` when the
points played in the game (or in the tiebreak, or in a tiebreak-only set) are even, `ad` when odd; in an
aggregate format, timed segments included, from the parity of the aggregate total so far
(CA 2026-10-18); none in a timed segment that is not aggregate. v1 writes
the aggregate rule for INTENNSE, whose segments are timed, and never reaches it for a timed segment
(`SET7XA-S:T10P` points carry no `serveSide`): a v1 defect (§ 16, 14). A No-Ad deciding point,
where the receiver chooses, is still reported as `deuce`. A caller that saw the half supplies `observedServeSide`, recorded beside it (S7, CA 2026-10-17;
`substitutionAndService.test.ts`, "S7").

### 10.6 Orientation: the first explicit server and setServer

The derivations above assume side 1 serves first. The orientation is read in this order:

1. **`setServer(side)`**: at its position on the timeline, the orientation becomes "flipped" exactly
   when `side` differs from the base derivation there; it governs from that point on and replaces rule 2.
   It is replayed at its position on every rebuild (`tiebreakServiceOrder.test.ts`, "a set tiebreak
   opened by side 2 after a setServer correction"; "survives undo, redo and reload, including a
   mid-tiebreak setServer correction"; `setServer-recordEntry.test.ts`). A correction made with
   `recordEntry: false` is recorded on the entry before it and replayed with it (§ 2.6), and a
   baseline's `server` is a `setServer` at the baseline's position (§ 2.5) (CA 2026-10-18).
2. **The first recorded point's supplied server**: if it differs from the base derivation at that
   point's position, every derivation is flipped. A match that starts mid-tiebreak is not placed
   correctly by this rule (a known limit of #5512).
3. Otherwise side 1 serves first.

### 10.7 The competition's rule

Under `serverRule: WINNER_SERVES` the server of a point is the winner of the point before it, and side
1 for the first point. A `setServer(side)` names the next point's server only; the rule resumes after
that point, and a correction naming the side already named changes nothing and records nothing (CA
2026-10-21, SE3-E3). The engine supplies that server to the scorer, so the server shown
(`getNextServer()`), the server recorded and the server a rebuild derives agree; it is calculated, not
recorded (S5, #5517). A server the caller supplies is recorded as played, and the rule resumes after it
(`scoringAgreement.test.ts`, "S5: the competition server rule decides the recorded server too").

### 10.8 The S/R code

A point with a known server and no `code` is coded `S` when the server won it and `R` when the receiver
did. Where no server is derived (§ 10.2, § 10.4) and none is supplied, no S/R code, break point or
other server-based statistic is produced (CA 2026-10-18).

## 11. Views and events

Views are derived from the state and never recorded as inputs. **Every view reads the format
governing the set in play and the match's completion rule** (§ 3.2; CA 2026-10-18).

### 11.1 The materialized point

Beside its recorded facts, a point carries: `pointNumber` (1-based), both spellings of winner and server,
`timestamp` (the clock's now when not supplied), `index`, and its coordinates `set` (0-based),
`game` (the games its set had completed before its game began, however they were recorded) and
`number` (the points played in its game before it); `score`, the game score after the point (`15-0`,
`40-40`, `A-40` in a traditional game; numeric in a tiebreak, a tiebreak-only set, a consecutive-points
game and a timed segment; `0-0` when the point completes a game); the points-to decorations (§ 11.2);
`serveSide`; `scoreValue` when the effective value is not 1; and `activePlayers`, the lineUps on court
for the point (both players per side in doubles), which every rebuild keeps
(`aRebuildKeepsActivePlayers.test.ts`).

### 11.2 Points-to and the situation

Computed before each point, from the score at the serve, for the set in play's format:

- `pointsToGame`: for each side, the fewest points it must win in a row, the opponent scoring none, to
  win the game (or tiebreak, or tiebreak-only set); counted against the same predicate that completes
  the game, so No-Ad, deuce caps and margins agree (`pointsToMinimum.test.ts`). A consecutive game needs
  its run length.
- `gamesToSet`, `pointsToSet` (the game's points plus the remaining games at four points each), and
  `pointsToMatch` (the set's points plus the remaining sets at their minimum). `gamesToSet` is the
  games won in a row that win the set by its rule, the tiebreak counting as one more (4-5 in a
  tiebreak set: 3; the one-game set `S:1/TB7` from love: 2), and each remaining set is counted at the
  minimum of the format governing it then, a deciding set at the final format's (`SET3-S:4WB1-F:TB7`
  one set down: 16 + 7). A timed segment, outs and a combined total add nothing (SE2b-D23, D25, D26;
  CA 2026-10-21).
- `isBreakpoint`: the receiver needs one point to win the game.
- The score situation for the next point: `isGamePoint` (the server needs one), `isBreakPoint`,
  `isSetPoint`, `isMatchPoint` (either side needs one), `isGoldenPoint` (both need one, under No-Ad or a
  deuce cap outside a tiebreak), `isTiebreak`, `server`, and `serverDerived` (whether `server` is the
  engine's derivation, § 10.4).
- `decisionRequired`: true when the match is `COMPLETED` without a winner (§ 9.7), in the situation
  and on the scoreboard, so an elimination host knows to ask for a decision (CA 2026-10-18).
- A timed segment has no points-to: every situation flag is false. A combined total's match point is a
  rally that would complete it with a winner, and its golden point is the `DP` rally.

Points-to-match counts by the match's completion rule: sets to win in best of N, all N in exactly N,
the total in an aggregate (and, level, the declared decider). A side that cannot win the match however
many points in a row it wins (in exactly N, more sets than the other once all N are played; in an
aggregate, the greater total) has no count: its `pointsToMatch` is `-1`, and it has no match point. v1 counts by best-of sets in exactly and aggregate formats (`HAL3X-S:TB11` at
one half to love and 10-0 reports a match point; `SET3A-S:TB11` at two games to love and 9-0 gives
`pointsToMatch` `[0, 22]`): a v1 defect (§ 16, 13).

### 11.3 Score strings, scoreboard, episodes, statistics

- The score string joins the sets, a set with a tiebreak showing the loser's tiebreak points (`7-6(3)`).
- `getScoreboard()` adds the game in play, read by the format governing the set in play: a
  tiebreak-only set or a set tiebreak shows numeric points. v1 reads the ordinary format and tennis
  points (`SET3-S:TB11` at 5-3 shows `0-0 (G-40)`; a `-F:4/TB7` final-set tiebreak shows `(40-15)`): a
  v1 defect (§ 16, 13).
- `getEpisodes()` enriches each point with its game, set and match context; a game interrupted by
  `addGame` or `addSet` is credited to no point, and a set is complete on the point that won it
  (`getEpisodesInterruptedGames.test.ts`).
- Statistics count each point result in exactly its own categories (S12, `scoringAgreement.test.ts`);
  standalone enrichment keeps what a point recorded and fills only missing context (S13).

### 11.4 Input levels and input mode

`getInputLevels()` reports § 3.3 for the set in play. `getInputMode()` reports which inputs the
timeline holds (`points`, `games`, `sets`, `mixed`, `none`), not counting baselines, segment ends,
server corrections, substitutions, challenges or annotations. v1 counts a server correction and a
substitution as inputs, so a point-only match with one correction is `mixed`: a v1 defect (§ 16, 13).

### 11.5 Events

Handlers fire synchronously after the action, with the state and the score.

| event                         | fires                                                                                             |
| ----------------------------- | ------------------------------------------------------------------------------------------------- |
| `onPoint`                     | a point is recorded (never for a refused or ignored point)                                        |
| `onGameComplete`              | that point completed a game, with `gameWinner` the side that won the point (either spelling, S11) |
| `onSetComplete`               | that point completed a set with a winner, with `setWinner`                                        |
| `onMatchComplete`             | that point completed the match with a winner, with `matchWinner`                                  |
| `onMatchTie`                  | that point completed the match without a winner (§ 7, § 9.7)                                      |
| `onUndo`, `onRedo`, `onReset` | their action succeeded; a rebuild re-emits no historical point events                             |

They fire in that order on one point. Game, set, baseline and segment-end actions fire no scoring
events, with one exception: the action that ends a match level by § 9.7 (an `endSegment` closing the
last timed segment level, a set total completing a level count) fires `onMatchTie`, as the last rally
of a combined-total tie does (CA 2026-10-18) (`scoringAgreement.test.ts`, "S11"; `event-handlers`
page). `onGameComplete` fires only where a point completes a game; a points-based timed segment has none. v1 fires it on every point of such a
segment (`SET3-S:T10P`: three points, three events): a v1 defect (§ 16, 13).

## 12. Persistence and replay

### 12.1 The timeline

`history.entries` is an ordered list of `{ type, data, timestamp, pointIndex? }`. A `point` entry's
`pointIndex` is the index of the point it produced in `history.points`. The score is a pure function of
the configuration and the entries: **a rebuild** starts from a fresh score and replays every entry in
order. It keeps everything that is not scoring: the matchUp's identity, participants and any metadata a
host attached; only `score`, `history`, `winningSide`, `matchUpStatus`, `endTime` and the orientation
start over (`replayLossless.test.ts`, "a rebuild keeps the matchUp identity and participants"). The
lineUps start from their initial snapshot and the substitutions replay in order, so each point keeps the
players who played it (`aRebuildKeepsActivePlayers.test.ts`). An entry of a type the engine does not know
is kept in place and not replayed (§ 12.6); a `challenge` or `annotation` is replayed and changes no
score (§ 2.8).

### 12.2 What a point entry holds

Every field the caller supplied, including fields beyond the typed options, and no calculated field
(§ 1.4). A rebuild replays the entry as recorded: its value, flags and decorations survive undo, redo,
`editPoint`, `removePoint` and a reload (`replayLossless.test.ts`, "S1"). **The entry is authoritative
over the materialized point**: a point's calculated values are a cache, and a rebuild recomputes them
(R2, decision 4; `tiebreakServiceOrder.test.ts`, "tiebreak servers on records saved under the old
rotation").

### 12.3 Undo and redo

- `undo(n)` moves the last n entries, of any type, to the redo stack (a `point` entry takes its point
  with it, and a server correction attached to an entry goes with that entry, § 2.6) and rebuilds. It
  takes back whatever was recorded last, a challenge or an annotation included (§ 2.8; CA 2026-10-18).
  It returns false when there is nothing to undo, and for `n` below 1, which undoes nothing (CA
  2026-10-21, SE3-E2).
- `redo(n)` moves the last n back onto the timeline and rebuilds; false, likewise, when there is
  nothing to redo or `n` is below 1.
- **A recorded action clears the redo stack** (point, game, set, segment end, baseline, server
  correction, substitution, challenge, annotation); **an action that changes nothing records nothing**
  and keeps it, as a refused or ignored one does (CA 2026-10-18). v1's `endSegment` does not clear it,
  so `SET3-S:T10P` point, point, undo, `endSegment`, redo replays the undone point after the segment
  end, into set 2; and `endSegment` with no set in play records an entry (`setNumber: 0`) that `undo`
  then pops: v1 defects (§ 16, 1).
- Undo and redo cross game, set and tiebreak boundaries, and a mix of input levels, as one timeline
  (`undo-redo.test.ts`).

### 12.4 Corrections

- `editPoint(i, data)` refuses invalid data before anything changes (§ 2.1), writes every field given
  to the point and to its entry, and rebuilds. A winner or server edited in one spelling clears the
  other spelling on the entry, so the replay reads the edit. With `recalculate: false` the score is left
  as it was until the next rebuild, which applies the edit (`aCompletedMatchTakesCorrections.test.ts`).
- `removePoint(i)` removes the point and its entry, renumbers the later point entries, and rebuilds.
  With `recalculate: false` the score is left as it was until the next rebuild, and it still counts the
  removed point: a point added meanwhile is numbered (`index`, `pointNumber`) as that score counts it,
  so no index repeats, and the rebuild renumbers them all (CA 2026-10-21, SE2c-D6). Its entry's
  `pointIndex` is still its position in `history.points` (§ 12.1), which a correction finds it by.
- `decoratePoint(i, metadata)` writes the metadata to the point and its entry without a rebuild; it
  survives every later rebuild.
- An index out of range is a no-op for all three. A rebuilding correction clears the redo stack.

### 12.5 The record a host saves

The host saves two things: the matchUp (`getState()`, a copy) and the supplementary envelope
(`getSupplementaryState()`), and restores them with `setState` then `loadSupplementaryState`. Both take
and return copies: what crosses the boundary is never the engine's own object (S9,
`publicBoundary.test.ts`, "S9: ownership"). `setState` adopts the matchUp's format and identity, clears
the redo stack, and takes the initial lineUps from the current ones with the substitutions on the
timeline undone.

Either engine reads the record the other wrote, so a cutover and a rollback load what is stored. The
two write the same record but for the orientation's encoding: v1 writes `serverFlip` and a baseline's
`serverCorrection`, v2 neither, and each reads the other's from the timeline, `history.initialServer`
and a baseline's `server`. The differential holds both: the whole record is compared after every call,
and a fresh v1 must name the next server a fresh v2 names when each loads v2's record.

### 12.6 Every persisted shape v2 must read

1. **An entries-based record** (`history.entries` present): rebuilt from its entries. Its point entries
   may predate S1 (#5515) and hold fewer fields; the entry is still authoritative. **Its timeline is
   authoritative over its stored score** (SE2c-D3, CA 2026-10-21): loaded, the record is returned as
   stored, but the next action, and every view, are taken on the score its timeline rebuilds to (with
   the configuration then loaded; `loadSupplementaryState` prepares it again). That action writes the
   timeline's score and keeps the stored points until the next rebuild.
2. **A legacy point-only record** (points, no `entries`): loaded as stored. Without a timeline,
   `undo` pops points (the redo stack holds each point's replay input), `redo` re-adds them through the
   scorer, and a correction rebuilds from the points. A point's replay input is every field except the
   calculated ones of § 1.4, so its stored `scoreValue` (the effective value) and its stored `server`
   replay as given, and the old result stands (`replayLossless.test.ts`, "a record with no timeline
   replays its points with their recorded facts"). **The first recorded action on such a record first
   builds a timeline from its points**, so a later rebuild keeps them ("a new point on a record with no
   timeline keeps the points before it through a rebuild"). Its rebuild keeps the matchUp's identity,
   participants and host metadata, like every rebuild (§ 12.1; `aLegacyRebuildKeepsIdentity.test.ts`).
3. **Points saved under the old tiebreak rotation** (before #5512): loaded as stored; calculated servers
   are re-derived on the next rebuild, supplied ones kept.
4. **Substitution events without `setNumber`** (before 2026-10-17): placed by the point they preceded.
5. **The supplementary envelope, version 0** (no `version`): `redoStack` and `initialLineUps` only. The
   engine keeps the configuration it was constructed with (`replayLossless.test.ts`, "an envelope
   written before the version loads as it always did").
6. **The supplementary envelope, version 1**: `version: 1`, `redoStack`, `initialLineUps` (keyed by side
   number as a string), and the scoring configuration the history was scored under,
   `competitionFormat` and `pointMultipliers`, which **replace the constructor's** so a rebuild scores
   the history the same way (S10; "the saved configuration is what the history was scored under").
7. **Host-written `challenge` entries** (epixodic's `{ type: 'challenge', data: { sideNumber } }`): read
   unchanged as `challenge` actions (§ 2.8). Any other foreign entry: kept, not replayed.
8. **`hardBoundaries`** on a set: read and ignored; a rebuild discards them (§ 2.9).

### 12.7 Determinism

A replay uses the recorded timestamps. An action without one is stamped by the clock, as is `endTime`
on completion, so a reproducible stream sets the clock (the corpus does). Nothing else in scoring reads
the clock or a random source.

### 12.8 Legacy shapes: refusals apply at the action boundary

**A refusal this page adds applies when an action is offered, never on replay** (decided 2026-10-18).
When a persisted timeline already holds entries v1 accepted that the rules above now refuse or ignore,
the reducer replays them as v1 replayed them, flagged as a legacy shape, so a stored score never
changes on load. The shapes are those of the decisions recorded in § 16:

- scoring past a level close: further segments after a level timed segment or a level aggregate
  (§ 9.7), input into a closed segment (§ 6.4), set or game input after `COMPLETED` (§ 9.6), a set past
  N (§ 9.2);
- a non-timed `endSegment` (§ 2.4);
- a format v1 accepted and validation now refuses: a tiebreak below S − 1 (§ 4.2), an aggregate of
  standard sets (§ 9.3);
- an action v1 accepted with facts now refused (§ 2), and a second baseline (§ 2.5).

The reducer never produces such an entry live. **No version flag is needed**: an entry's presence on
the timeline proves v1 wrote it.

**The replay rule covers only entries distinguishable as v1's.** Four entries look the same whether v1
or the current engine wrote them, and they take the current rule on rebuild (CA 2026-10-18: "Accept the
change"; no version stamp): a game in a tiebreak-only set (§ 5), a game after a timed segment closed
level (§ 6.4), a baseline set v1 judged by "reached setTo" (6-5 is no longer won, § 2.5), and a set total
entered while a set is in play (§ 2.3). A stored archive holding one of them can rebuild to a different
score.

## 13. What is deliberately not modelled

These are boundaries, not omissions. v2's action set is versioned so that a later correction event is
an additive action, not a format change.

- **Participant-level service**: the doubles service order, which player serves (`serverParticipantId`
  is host metadata only), the receiver and the receiving order, and observed versus expected server
  participant. Deferred by CA (S7) to its own plan.
- **ITF Rule 27 corrections**: wrong server, wrong court half, wrong receiving order, and their
  rule-specific remedies. A host corrects the side due to serve with `setServer`; `wrongSide` and
  `wrongServer` are decorations that change no score.
- **Side-out scoring**: the engine scores every point it is given (§ 5).
- **A sport's own service order** in a tiebreak-only format: no server is derived there until each
  sport's rule is added (§ 10.2); and the receiver's choice of court half on a No-Ad deciding point
  (§ 10.5).
- **A decision on a match that ended level** is the host's (§ 9.7): the engine says one is required.
- **A team-level decider** (decided 2026-10-18). The INTENNSE Arc decider, a level Arc total across a
  team matchUp's tieMatchUps, belongs to the team format (tieFormat `winCriteria.aggregateValue` plus a
  team-level decider), not to `-F:` on a tieMatchUp, which would fire on a level tieMatchUp when the Arc
  is not level. The grammar refuses `SET1A-S:T10-F:TB1` (the INTENNSE doubles format) in any case.
  Tracked in Mentat TASKS ("INTENNSE: the Arc's deciding point is ignored when the last tieMatchUp is
  uneven").
- **Clocks**: a match clock, a segment clock, shot clocks, timeouts and changeovers are the host's.
- **Penalties as rules**: `penaltyType` and `penaltyPoint` are recorded facts; a penalty point is a point
  the host adds.
- **Substitution rules as refusals** (§ 2.7), and rosters.
- **Outs and runs point by point** (§ 8).
- **`history.states`**, a declared field nothing writes or reads.

## 14. Standing decisions carried over

| decision                                                                                                                                                  | where         |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| R2: a timeline entry records a server only when supplied; calculated values are snapshots; the entry is authoritative (2026-10-17)                        | § 1.4, § 12.2 |
| The input-level contract: a kind with no point model refuses point input; `getInputLevels()` reports it (S4, #5518)                                       | § 3.3, § 8    |
| Substitution rules are advisory; `substitute()` refuses only identity errors (S6, CA 2026-10-17)                                                          | § 2.7         |
| `observedServeSide` is recorded; the participant-level model is deferred (S7, CA 2026-10-17)                                                              | § 10.5, § 13  |
| A one-point tiebreak (`TB1`) is sudden death (CA 2026-10-17, #5529)                                                                                       | § 4.3, § 9.4  |
| The one-game set follows Rule 6: a margin of two, the tiebreak at one all (CA 2026-10-17, #5530)                                                          | § 4.2         |
| Timed sets: points build games under the SET root; a level set plays its declared tiebreak; an exactly format's final set is set N (CA 2026-10-17, #5533) | § 3.2, § 6    |
| A level exactly-N count names no winner (#5529)                                                                                                           | § 9.2         |
| An aggregate decider is set N + 1, never one of the N (CA 2026-10-04)                                                                                     | § 3.2, § 9.4  |
| A finished match takes no more points, and an ignored point records nothing (7.5.0, 7.7.0)                                                                | § 2.1, § 9.6  |
| The engine does not model side-out; every point given counts (2026-10-17)                                                                                 | § 5, § 13     |
| CA's decisions of 2026-10-18 on the questions this page first left open                                                                                   | § 16          |
| v2's reducer never mutates its input; the published pure `addPoint` keeps its in-place behaviour through 7.x and retires at 8.0.0 (plan § 8.4)            | —             |

## 15. What the suite and the corpus pin

|                    |                                                                                                                                                                                                    |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| conformance matrix | 81 cells from the factory's harvested formats: 77 held by independent cases, 4 refused, none missing (`formatMatrix.test.ts`); every cell placed in § 17                                           |
| conformance cases  | about 300, written from rulebooks (ITF, USA Pickleball, World Squash, ITTF, BWF, FIVB, VALORANT) or from the format definitions, each held five ways (see the opening)                             |
| v1/v2 differential | `SCORING_ENGINE=differential`: every v1 call made on a v2 engine shell too, and the result and state compared; `SCORING_ENGINE=v2` runs the suites on v2 alone; `pnpm verify:scoring-differential` |
| engine tests       | the S1–S13 fixes (#5511–#5521), the defects the cases found (#5529, #5530, #5533) and the replay, boundary and service tests cited above                                                           |
| scoring corpus     | 72 seeded streams (8 formats × 3 biases × 3 seeds) through the pure `createMatchUp`/`addPoint`, each step's result pinned by the manifest (#5511), and one point after completion each             |
| class timeline     | undo, redo, edits, baselines, segment ends, server corrections, substitutions, save and load, as corpus scenarios, with every conformance cell (SE3, #5658)                                        |

## 16. Decisions (2026-10-18)

> **v1 since then** (2026-10-21): #5612(factory), #5614(factory) and #5618(factory) brought v1 to most of
> these decisions on 2026-10-18, so most "v1 defect" notes below describe v1 before them; they stay as the
> record of each decision. The v1/v2 differential (§ 15) finds no difference on standard and tiebreak-only
> formats beyond three shape questions recorded for CA in the scoring-engine v2 plan (SE2a-D3b, D11, D12).
> On 2026-10-21 CA ruled five of its questions for the rule, and v1 was brought to them: every set carries
> `isTiebreakOnly` or `isTimed` by the format governing it, however it was entered (D11); a timed set scored
> in units has no per-game counts (D17); a combined total's points carry `index`, `set`, `game` and `number`
> (D18, § 11.1); the point that wins a tiebreak at time shows `0-0` (D20, § 11.1); and a consecutive game's
> `pointsToGame` counts the run in progress (D24, § 11.2). A completed match derives no server (D22, § 10.4).

The first version of this page left 21 questions to CA. CA decided all of them on 2026-10-18; each
rule now stands in the section named, and the v1 behaviour beside it is **a v1 defect to fix before
cutover**, which the v1/v2 differential surfaces. v1 was probed on factory `dev` at `0fcd079843`; the
streams are given in the sections. One rule covers every new refusal: **refusals apply at the action
boundary only**, and a persisted timeline holding entries v1 accepted replays as v1 replayed it,
flagged as a legacy shape, with no version flag (§ 12.8). Nothing is left open.

1. **DECIDED: the redo stack.** A recorded action clears it; an action that changes nothing records
   nothing (§ 2, § 12.3). v1 defect: `endSegment` keeps the redo stack and records a no-op entry.
2. **DECIDED: `endSegment` ends timed segments only** and is refused elsewhere; a set-level mercy or
   manual end is `addSet` with an explicit `winningSide`; a match-level stop is a `matchUpStatus`;
   `reason` is a free host string (§ 2.4). v1 defect: accepted on any segment. Persisted non-timed
   entries replay as v1 (§ 12.8).
3. **DECIDED: a match that ends level with no declared decider is `COMPLETED` without a winner**,
   `onMatchTie` fires, no undeclared segment is played, and the views expose `decisionRequired`
   (§ 6.4, § 9.1, § 9.7, § 11.2). The elimination guard `formatCanEndTied` extends to timed, aggregate
   and exactly-N formats with no declared decider, even best-of formats, and formats whose decider can end level
   (§ 9.7 rule 4). v1 defect: further segments are
   opened; v1 change: the guard.
4. **DECIDED: a closed segment takes no input** (§ 2, § 6.4). v1 defect: `addGame` reopens it.
5. **DECIDED: a completed match takes no scoring input**; a set and a game are ignored with a result
   flag, as a point is (§ 2, § 9.6). v1 defect: `addSet` and `addGame` apply.
6. **DECIDED: `addSet` judges a total by its segment's rule**: finished totals get the rule's winner,
   a contradicting `winningSide` is refused, an unfinished total with no winner is the set in play
   (§ 2.3). v1 defect: any unequal total is won.
7. **DECIDED: exactly N takes no set beyond N** (§ 2.3, § 9.2). v1 defect: a set total past N is
   recorded.
8. **DECIDED: the late-start baseline** judges its sets by their segment rule, completes a decided
   match, keeps an unfinished last set in play, honours `server` as a recorded `setServer`, is refused a
   second time once scoring entries exist, and checks `matchUpStatus`/`winningSide` for consistency
   (§ 2.5). v1 defects: each of those.
9. **DECIDED: a `scoreValue` other than 1 is refused where a point is not a unit**; multipliers apply
   only to segments scored in units (§ 2.1, § 4.4, § 7). v1 defect: recorded and ignored, or silently
   dropped in `P{n}`.
10. **DECIDED: every action refuses invalid facts before writing** (§ 1.1, § 2). v1 defect: only
    `addPoint` and `editPoint` validate.
11. **DECIDED: a game in a tiebreak-only segment is the segment won 1-0**, `tiebreakScore` its points,
    checked against the race to n; the input levels keep offering game (§ 2.2, § 5). v1 defect: a game
    is one point.
12. **DECIDED: a level aggregate with no declared decider follows decision 3** (§ 9.3, § 9.7). v1
    defect: play-on. The format-support page's "a tied total names no winner until a deciding point
    breaks it" now applies only with a declared decider.
13. **DECIDED: every view reads the format governing the set in play and the completion rule** (§ 3.2,
    § 11). v1 defects: the scoreboard, points-to-match, `onGameComplete` in a points-based timed
    segment, and `getInputMode()`.
14. **DECIDED: timed service runs continuously across segments**; Rule 5(b) applies to a tiebreak at
    time; a timed aggregate segment takes the aggregate court-half rule (§ 10.3, § 10.5). v1 defects:
    each of those.
15. **DECIDED: under `@RALLY` the rally winner serves; in `P{n}` no server is derived**;
    `getNextServer()` keeps returning 0 or 1 and `isServerDerived()` / `serverDerived` says whether it
    is derived (§ 10.4, § 11.2). v1 defect: no `@RALLY` derivation and no indicator.
16. **DECIDED: a server correction survives undo and rebuild**; `recordEntry: false` attaches it to the
    preceding entry (§ 2.6, § 10.6, § 12.3). v1 defect, live in INTENNSE: the wrong server after an
    undo.
17. **DECIDED: tiebreak-only formats derive no server** until each sport's rule is added (Mentat TASKS,
    "research: each sport's service rule for the scoring engine"); a tennis match tiebreak keeps Rule
    5(b); no server-based statistics where no server is derived (§ 10.2, § 10.8). v1 change: Rule 5(b),
    S/R and break points on every tiebreak-only set.
18. **DECIDED: a level exactly-N match follows decision 3** (§ 9.2, § 9.7). v1 defect: it stays
    `IN_PROGRESS`; the suite's pin on `HAL2X-S:TB11` changes with it.
19. **DECIDED: `@T` with T < S − 1 is refused at validation** for new formats (§ 4.2); a
    consecutive-points game format in a timed set builds the declared game format (§ 3.5); **an
    aggregate of standard sets is refused at validation**, and the courthive-components editor's
    Aggregate toggle is restricted to timed and tiebreak-only sets in the same change (§ 9.3 rule 5).
    Persisted formats of either refused kind replay by v1's rule (§ 12.8). v1 changes: the grammar, the
    timed game format, the editor.
20. **DECIDED: challenges and annotations are versioned timeline actions that change no score**; `undo`
    takes back whatever was recorded last; v1's raw `challenge` entries are read unchanged (§ 2.8,
    § 12.3, § 12.6). v1 already behaves so for epixodic's entries.
21. **DECIDED: the docs follow the code**: `winner` and `winningSide` may both be given when they
    agree (§ 1.3; the API page), `addSet`'s JSDoc states what v1 does (§ 2.3), and the
    `FORMAT_STANDARD_NOAD` comment states an advantage set with No-Ad games (§ 4.2).

**A boundary, not a rule of this engine** (decided 2026-10-18): the INTENNSE Arc decider belongs to the
team format (§ 13), tracked separately in Mentat TASKS.

## 17. The matrix, cell by cell

Every cell of `src/tests/scoring/conformance/formatMatrix.ts`, by its id, with the sections whose rules
score it and the cases that hold it. The gate `specCitesEveryCell.test.ts` fails on a cell missing here,
on a cited id the matrix does not hold, and on a cell line that names no section.

**Standard sets**

- `bestOf | SET | set:standard(tiebreak) | final:same | game:traditional | noClock | knownModifiers` — § 4.1, § 4.2, § 4.3, § 9.1, § 10.1; `standardSets` (`SET3-S:6/TB7`, `SET5-S:6/TB7`, `SET3-S:4/TB7`), `tiebreakServiceOrder.test.ts`; corpus `scoring/set3-s-6-tb7/*`, `scoring/set5-s-6-tb7/*`, `scoring/set3-s-4-tb7/*`, `scoring/set1-s-8-tb7/*`
- `bestOf | SET | set:standard(tiebreak) | final:same | game:traditional | clock | knownModifiers` — § 3.4, § 4.2, § 9.1; `standardSets` (`SET3-S:6/TB7-M:T60`)
- `bestOf | SET | set:standard(tiebreak) | final:same | game:traditional | noClock | unknownModifiers` — § 3.4, § 4.2, § 4.3; `finalSegments` (`SET3Z-S:6/TB7`)
- `bestOf | SET | set:standard(tiebreak) | final:standard(advantage) | game:traditional | noClock | knownModifiers` — § 3.2, § 4.2, § 4.5, § 10.1; `standardSets` (`SET3-S:6/TB7-F:6`), `tiebreakServiceOrder.test.ts`
- `bestOf | SET | set:standard(tiebreak) | final:standard(tiebreak) | game:traditional | noClock | knownModifiers` — § 3.2, § 4.3, § 4.5; `standardSets` (`SET3-S:6/TB7-F:6/TB10`)
- `bestOf | SET | set:standard(tiebreak) | final:standard(tiebreak,earlyTiebreak) | game:traditional | noClock | knownModifiers` — § 3.2, § 4.2, § 4.5; `standardSets` (`SET5-S:6/TB7-F:6/TB7@12`)
- `bestOf | SET | set:standard(tiebreak) | final:tiebreakSet | game:traditional | noClock | knownModifiers` — § 3.2, § 4.5, § 5, § 10.2; `standardSets` (`SET3-S:6/TB7-F:TB10`)
- `bestOf | SET | set:standard(tiebreak) | final:tiebreakSet(noAD) | game:traditional | noClock | knownModifiers` — § 4.3, § 4.5, § 5; `standardSets` (`SET3-S:6/TB7-F:TB10NOAD`)
- `bestOf | SET | set:standard(tiebreak) | final:timed(G) | game:traditional | noClock | knownModifiers` — § 3.2, § 4.5, § 6.2, § 6.4; `finalSegments` (`SET3-S:6/TB7-F:T20`)
- `bestOf | SET | set:standard(tiebreak) | final:timed(P) | game:traditional | noClock | knownModifiers` — § 3.2, § 4.5, § 6.2, § 6.4; `finalSegments` (`SET3-S:6/TB7-F:T20P`)
- `bestOf | SET | set:standard(tiebreak) | final:outs | game:traditional | noClock | knownModifiers` — § 3.2, § 3.3, § 8; `finalSegments` (`SET3-S:6/TB7-F:O3`), `inputLevels.test.ts`
- `bestOf | SET | set:standard(tiebreak,earlyTiebreak) | final:same | game:traditional | noClock | knownModifiers` — § 4.2, § 4.3; `tiebreakSetVariants` (`SET3-S:4/TB5@3`, `SET3-S:6/TB7@5`, `SET1-S:8/TB7@7`, `SET3-S:6/TB7@12`); corpus `scoring/set3-s-4-tb5-3/*`
- `bestOf | SET | set:standard(tiebreak,earlyTiebreak) | final:tiebreakSet | game:traditional | noClock | knownModifiers` — § 4.2, § 4.5, § 5; `tiebreakSetVariants` (`SET3-S:4/TB7@3-F:TB7`)
- `bestOf | SET | set:standard(tiebreak,earlyTiebreak,noAD) | final:same | game:traditional | noClock | knownModifiers` — § 4.1, § 4.2, § 4.3; `tiebreakSetVariants` (`SET3-S:4NOAD/TB7@3`)
- `bestOf | SET | set:standard(tiebreak,earlyTiebreak,noAD) | final:tiebreakSet | game:traditional | noClock | knownModifiers` — § 4.1, § 4.2, § 4.5, § 5; `tiebreakSetVariants` (`SET3-S:4NOAD/TB5@3-F:TB10`)
- `bestOf | SET | set:standard(tiebreak,earlyTiebreak,tiebreakNoAD,noAD) | final:same | game:traditional | noClock | knownModifiers` — § 4.1, § 4.2, § 4.3; `tiebreakSetVariants` (`SET5-S:5NOAD/TB9NOAD@4`)
- `bestOf | SET | set:standard(tiebreak,earlyTiebreak,tiebreakNoAD) | final:same | game:traditional | noClock | knownModifiers` — § 4.2, § 4.3; `tiebreakSetVariants` (`SET1-S:6/TB5NOAD@5`)
- `bestOf | SET | set:standard(tiebreak,noAD) | final:same | game:traditional | noClock | knownModifiers` — § 4.1, § 4.3; `tiebreakSetVariants` (`SET3-S:6NOAD/TB7`)
- `bestOf | SET | set:standard(tiebreak,noAD) | final:tiebreakSet | game:traditional | noClock | knownModifiers` — § 4.1, § 4.5, § 5; `tiebreakSetVariants` (`SET3-S:6NOAD/TB7-F:TB10`); corpus `scoring/set3-s-6noad-tb7-f-tb10/*`
- `bestOf | SET | set:standard(tiebreak,tiebreakNoAD,noAD) | final:same | game:traditional | noClock | knownModifiers` — § 4.1, § 4.3; `tiebreakSetVariants` (`SET3-S:6NOAD/TB7NOAD`)
- `bestOf | SET | set:standard(tiebreak,tiebreakNoAD) | final:same | game:traditional | noClock | knownModifiers` — § 4.3; `tiebreakSetVariants` (`SET3-S:6/TB7NOAD`, `SET1-S:6/TB7NOAD`)
- `bestOf | SET | set:standard(tiebreak,oneGame) | final:same | game:traditional | noClock | knownModifiers` — § 4.2 rule 4; `tiebreakSetVariants` (`SET3-S:1/TB7`)
- `bestOf | SET | set:standard(tiebreak) | final:same | game:consecutive | noClock | knownModifiers` — § 3.5, § 4.1, § 4.3; `tiebreakSetVariants` (`SET3-S:4/TB5-G:3C`, `SET3-S:6/TB7-G:3C`)
- `bestOf | SET | set:standard(tiebreak) | final:same | game:traditional(deuceCap) | noClock | knownModifiers` — § 3.5, § 4.1, § 4.3; `tiebreakSetVariants` (`SET3-S:6/TB7-G:TN3D`, `SET3-S:6/TB7-G:TN1D`, `SET3-S:6/TB7-G:TN2D`)
- `bestOf | SET | set:standard(tiebreak) | final:tiebreakSet | game:traditional(deuceCap) | noClock | knownModifiers` — § 3.5, § 4.1, § 4.3, § 5; `tiebreakSetVariants` (`SET3-S:6/TB7-G:TN3D-F:TB10`)
- `bestOf | SET | set:standard(advantage) | final:same | game:traditional | noClock | knownModifiers` — § 4.1, § 4.2 rule 1, § 9.1; `advantageAndShortSets` (`SET3-S:6`, `SET1-S:8`, `SET5-S:6`), `noTiebreakIsNoTiebreak.test.ts`
- `bestOf | SET | set:standard(advantage) | final:standard(advantage) | game:traditional | noClock | knownModifiers` — § 3.2, § 4.2 rule 1, § 4.5; `advantageAndShortSets` (`SET3-S:6-F:6`, `SET5-S:6-F:6`)
- `bestOf | SET | set:standard(advantage) | final:same | game:consecutive | noClock | knownModifiers` — § 3.5, § 4.1 rule 4, § 4.2 rule 1; `advantageAndShortSets` (`SET5-S:5-G:3C`, `SET3-S:4-G:2C`)
- `bestOf | SET | set:standard(advantage,noAD) | final:same | game:traditional | noClock | knownModifiers` — § 4.1 rule 2, § 4.2 rule 1; `advantageAndShortSets` (`SET3-S:6NOAD`, `SET1-S:5NOAD`); corpus `scoring/set3-s-6noad/*`
- `bestOf | SET | set:standard(advantage,noAD) | final:tiebreakSet | game:traditional | noClock | knownModifiers` — § 4.1, § 4.2, § 4.5, § 5; `advantageAndShortSets` (`SET3-S:4NOAD-F:TB7`)
- `bestOf | SET | set:standard(advantage,winBy1) | final:same | game:traditional | noClock | knownModifiers` — § 4.2 rule 1; `advantageAndShortSets` (`SET3-S:5WB1`, `SET1-S:5WB1`)
- `bestOf | SET | set:standard(advantage,winBy1) | final:same | game:consecutive | noClock | knownModifiers` — § 3.5, § 4.1 rule 4, § 4.2 rule 1; `advantageAndShortSets` (`SET5-S:5WB1-G:3C`)
- `bestOf | SET | set:standard(advantage,winBy1) | final:tiebreakSet | game:traditional | noClock | knownModifiers` — § 4.2 rule 1, § 4.5, § 5; `advantageAndShortSets` (`SET3-S:4WB1-F:TB7`)
- `bestOf | SET | set:standard(advantage,noAD,winBy1) | final:same | game:traditional | noClock | knownModifiers` — § 4.1 rule 2, § 4.2 rule 1; `advantageAndShortSets` (`SET3-S:4NOADWB1`, `SET1-S:4NOADWB1`)
- `exactly | INN | set:standard(tiebreak) | final:same | game:traditional | noClock | knownModifiers` — § 3.4, § 4.2, § 9.2; `timedSegments` (`INN3X-S:6/TB7`)

**Tiebreak-only segments**

- `bestOf | SET | set:tiebreakSet | final:same | game:traditional | noClock | knownModifiers` — § 5, § 9.1, § 10.2; `tiebreakSets` (`SET3-S:TB11`, `SET5-S:TB11`, `SET7-S:TB11`, `SET3-S:TB21`, `SET1-S:TB10`); corpus `scoring/set1-s-tb10/*`
- `bestOf | SET | set:tiebreakSet | final:tiebreakSet | game:traditional | noClock | knownModifiers` — § 3.2, § 5; `tiebreakSets` (`SET5-S:TB25-F:TB15`, `SET3-S:TB15-F:TB11`)
- `bestOf | SET | set:tiebreakSet(noAD) | final:same | game:traditional | noClock | knownModifiers` — § 4.3, § 5; `tiebreakSets` (`SET3-S:TB11NOAD`, `SET3-S:TB15NOAD`)
- `bestOf | SET | set:tiebreakSet(@RALLY) | final:same | game:traditional | noClock | knownModifiers` — § 5 rule 4, § 10.4; `tiebreakSets` (`SET3-S:TB11@RALLY`, `SET1-S:TB11@RALLY`)
- `bestOf | SET | set:tiebreakSet(@RALLY) | final:tiebreakSet(@RALLY) | game:traditional | noClock | knownModifiers` — § 3.2, § 5, § 10.4; `tiebreakSets` (`SET5-S:TB21@RALLY-F:TB15@RALLY`)
- `bestOf | SET | set:tiebreakSet(@RALLY,noAD) | final:same | game:traditional | noClock | knownModifiers` — § 4.3, § 5, § 10.4; `tiebreakSets` (`SET3-S:TB11NOAD@RALLY`, `SET3-S:TB21NOAD@RALLY`)
- `bestOf | SET | set:tiebreakSet(@RALLY,noAD) | final:tiebreakSet(@RALLY,noAD) | game:traditional | noClock | knownModifiers` — § 3.2, § 4.3, § 5, § 10.4; `tiebreakSets` (`SET3-S:TB21NOAD@RALLY-F:TB15NOAD@RALLY`)
- `bestOf | FRM | set:tiebreakSet | final:same | game:traditional | noClock | knownModifiers` — § 3.4, § 5, § 9.1; `tiebreakSets` (`FRM7-S:TB11`)
- `bestOf | MAP | set:tiebreakSet | final:same | game:traditional | noClock | knownModifiers` — § 3.4, § 5, § 9.1; `tiebreakSets` (`MAP3-S:TB13`, `MAP5-S:TB13`)
- `bestOf+aggregate | SET | set:tiebreakSet | final:same | game:traditional | noClock | knownModifiers` — § 5, § 9.3; `tiebreakSets` (`SET3A-S:TB11`)
- `exactly | HAL | set:tiebreakSet | final:same | game:traditional | noClock | knownModifiers` — § 5, § 9.2; `tiebreakSets` (`HAL2X-S:TB11`, `HAL3X-S:TB11`)

**Timed segments**

- `bestOf | SET | set:timed(G) | final:same | game:traditional | noClock | knownModifiers` — § 6.1, § 6.2 rule 2, § 6.4, § 9.1; `timedSegments` (`SET3-S:T10`, `SET1-S:T20`, `SET5-S:T10`, `SET1X-S:T10`)
- `bestOf | SET | set:timed(G) | final:same | game:traditional(deuceCap) | noClock | knownModifiers` — § 3.5, § 4.1 rule 3, § 6.2 rule 2; `timedSegments` (`SET3-S:T10-G:TN3D`)
- `bestOf | SET | set:timed(G) | final:same | game:consecutive | noClock | knownModifiers` — § 3.5, § 6.2 rule 2; `timedSegments` (`SET3-S:T10-G:3C`)
- `bestOf | SET | set:timed(G) | final:timed(G) | game:traditional | noClock | knownModifiers` — § 3.2, § 6.1, § 6.4; `timedSegments` (`SET3-S:T20-F:T60`, `SET3-S:T15-F:T10`)
- `bestOf | SET | set:timed(G) | final:timed(G,tiebreak) | game:traditional | noClock | knownModifiers` — § 3.2 rule 1, § 6.4 rule 2, § 9.1; `timedSegments` (`SET3-S:T10-F:T10/TB7`), `viewsReadTheGoverningFormat.test.ts`
- `bestOf | SET | set:timed(G) | final:timed(G) | game:traditional(deuceCap) | noClock | knownModifiers` — § 3.2, § 3.5, § 6.2 rule 2; `timedSegments` (`SET3-S:T10-G:TN3D-F:T20`)
- `bestOf | SET | set:timed(G,@RALLY) | final:same | game:traditional | noClock | knownModifiers` — § 6.3; `timedSegments` (`SET3-S:T20@RALLY`)
- `bestOf | SET | set:timed(G,tiebreak) | final:same | game:traditional | noClock | knownModifiers` — § 4.3, § 6.4 rule 2; `timedSegments` (`SET3-S:T20/TB7`, `SET3-S:T10/TB1`, `SET3-S:T10G/TB1`), `timedSetTiebreak.test.ts`
- `bestOf | SET | set:timed(P) | final:same | game:traditional | noClock | knownModifiers` — § 6.1, § 6.2 rule 1, § 6.4; `timedSegments` (`SET3-S:T10P`, `SET1-S:T20P`, `SET1-S:T10P`)
- `bestOf | SET | set:timed(P,tiebreak) | final:same | game:traditional | noClock | knownModifiers` — § 4.3, § 6.4 rule 2; `timedSegments` (`SET3-S:T10P/TB1`, `SET3-S:T10P/TB7`, `SET3-S:T10P/TB10`, `SET5-S:T10P/TB1`)
- `exactly | SET | set:timed(G) | final:same | game:traditional | noClock | knownModifiers` — § 6.2 rule 2, § 9.2; `timedSegments` (`SET3X-S:T10`, `SET10X-S:T5`, `SET9X-S:T10`)
- `exactly | SET | set:timed(P) | final:same | game:traditional | noClock | knownModifiers` — § 6.2 rule 1, § 9.2; `timedSegments` (`SET4X-S:T20P`, `SET3X-S:T10P`)
- `exactly | SET | set:timed(P) | final:timed(G) | game:traditional | noClock | knownModifiers` — § 3.2 rule 2, § 6.2, § 9.2; `timedSegments` (`SET4X-S:T20P-F:T20`)
- `exactly | SET | set:timed(P) | final:timed(P) | game:traditional | noClock | knownModifiers` — § 3.2 rule 2, § 6.2 rule 1, § 9.2; `timedSegments` (`SET4X-S:T10P-F:T5P`)
- `exactly | SET | set:timed(P,tiebreak) | final:same | game:traditional | noClock | knownModifiers` — § 6.4 rule 2, § 9.2; `timedSegments` (`SET3X-S:T10P/TB1`)
- `standalone | SET | set:timed(G) | final:same | game:traditional | noClock | knownModifiers` — § 3.1, § 6.2 rule 3, § 6.4; `timedSegments` (`T120`, `T90`, `T60`, `T1`)
- `standalone | SET | set:timed(P) | final:same | game:traditional | noClock | knownModifiers` — § 3.1, § 6.2 rule 1, § 6.4; `timedSegments` (`T120P`, `T30P`, `T10P`)

**Aggregate formats**

- `bestOf+aggregate | HAL | set:timed(G) | final:same | game:traditional | noClock | knownModifiers` — § 6.2 rule 3, § 9.3; `aggregateSegments` (`HAL2A-S:T45`, `HAL2A-S:T20`)
- `bestOf+aggregate | PER | set:timed(G) | final:same | game:traditional | noClock | knownModifiers` — § 6.2 rule 3, § 9.3; `aggregateSegments` (`PER3A-S:T20`, `PER1A-S:T5`)
- `bestOf+aggregate | QTR | set:timed(G) | final:same | game:traditional | noClock | knownModifiers` — § 6.2 rule 3, § 9.3; `aggregateSegments` (`QTR4A-S:T12`, `QTR1A-S:T10`)
- `bestOf+aggregate | RND | set:timed(G) | final:same | game:traditional | noClock | knownModifiers` — § 6.2 rule 3, § 9.3; `aggregateSegments` (`RND12A-S:T3`, `RND5A-S:T5`)
- `bestOf+aggregate | SET | set:timed(G) | final:same | game:traditional | noClock | knownModifiers` — § 3.1, § 6.2 rule 3, § 9.3; `aggregateSegments` (`SET3A-S:T10`, `SET1XA-S:T10`, `SET1A-S:T20`)
- `exactly+aggregate | INN | set:timed(G) | final:same | game:traditional | noClock | knownModifiers` — § 6.2 rule 3, § 9.3; `aggregateSegments` (`INN4XA-S:T12`)
- `exactly+aggregate | SET | set:timed(G) | final:same | game:traditional | noClock | knownModifiers` — § 6.2 rule 3, § 9.3; `aggregateSegments` (`SET3XA-S:T10`, `SET9XA-S:T10`)
- `exactly+aggregate | SET | set:timed(P) | final:same | game:traditional | noClock | knownModifiers` — § 6.2 rule 1, § 9.3, § 10.3; `aggregateSegments` (`SET7XA-S:T10P`, `SET2XA-S:T10P`), `setServer-recordEntry.test.ts`
- `exactly+aggregate | SET | set:timed(G) | final:tiebreakSet | game:traditional | noClock | knownModifiers` — § 3.2 rule 3, § 4.3, § 9.4; `aggregateSegments` (`SET3XA-S:T10-F:TB1`, `SET2XA-S:T20-F:TB1`), `aggregateDeciderIsSetNPlusOne.test.ts`
- `exactly+aggregate | SET | set:timed(G) | final:tiebreakSet(noAD) | game:traditional | noClock | knownModifiers` — § 3.2 rule 3, § 9.4; `aggregateSegments` (`SET3XA-S:T10-F:TB1NOAD`)
- `exactly+aggregate | SET | set:timed(G) | final:timed(P) | game:traditional | noClock | knownModifiers` — § 3.2 rule 3, § 6.4, § 9.4; `aggregateSegments` (`SET3XA-S:T10-F:T10P`)

**Combined totals**

- `bestOf | SET | set:combined(ALLOW) | final:same | game:traditional | noClock | knownModifiers` — § 7, § 9.5, § 11.5; `combinedTotals` (`SET1-S:P32`, `SET1-S:P31`, `SET1-S:P4`)
- `bestOf | SET | set:combined(DECIDING_POINT) | final:same | game:traditional | noClock | knownModifiers` — § 7; `combinedTotals` (`SET1-S:P32DP`, `SET1-S:P4DP`)
- `bestOf | SET | set:combined(WIN_BY_MARGIN) | final:same | game:traditional | noClock | knownModifiers` — § 7; `combinedTotals` (`SET1-S:P32WB2`)

**Refused: segments of outs**

- `bestOf | SET | set:outs | final:same | game:traditional | noClock | knownModifiers` — § 3.3, § 8; `formatMatrix.test.ts` (`SET1-S:O3`)
- `bestOf+aggregate | HAL | set:outs | final:same | game:traditional | noClock | knownModifiers` — § 3.3, § 8; `formatMatrix.test.ts` (`HAL2A-S:O3`)
- `exactly+aggregate | INN | set:outs | final:same | game:traditional | noClock | knownModifiers` — § 3.3, § 8; `formatMatrix.test.ts`, `inputLevels.test.ts` (`INN4XA-S:O3`)
- `exactly+aggregate | INN | set:outs | final:same | game:traditional | clock | knownModifiers` — § 3.3, § 3.4, § 8; `formatMatrix.test.ts` (`INN4XA-S:O3-M:T50`)

## Related

- [Core API reference](./scoring-engine-api.md), [event handlers](./event-handlers.md) and
  [format support](./format-support.md): the engine's surface, which this page specifies.
- [matchUpFormat codes](/docs/codes/matchup-format): the grammar § 3 resolves.
- [The outcome pipeline](../concepts/outcome-pipeline.md): the same kind of specification for
  `setMatchUpStatus`, which this page follows.
