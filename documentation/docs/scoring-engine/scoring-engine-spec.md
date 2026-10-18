---
title: Scoring engine specification
---

The `ScoringEngine` keeps a CODES matchUp's score from the inputs a scorer gives it: points, games,
set totals, the end of a timed segment, a late-start baseline, a server correction and a
substitution. This page states the rules a second implementation has to reproduce without reading
the TypeScript: the inputs, the closed set of actions and the facts each carries, how a format
resolves to a rule for each set, each segment kind's rules, service, completion, what is refused,
and how a record is persisted and replayed. Where the engine's behaviour is a question rather than a
decision it is marked **OPEN** and listed in § 16.

First version, 2026-10-18 (SE1 of the scoring-engine v2 plan), written from the rules first and the
source second: the conformance suite (79 matrix cells: 75 held by independent cases written from
rulebooks and format definitions, 4 refused), the engine tests the S1–S13 fixes added, the scoring
corpus (72 seeded streams) and probes run against factory `dev` at `0fcd079843`. Where v1 and a
rule disagree and the suite does not settle it, this page states the rule and records v1's
behaviour as an OPEN item; it does not encode a v1 accident as the rule.

```text
state = reduce(configuration, timeline)

configuration   matchUpFormat → resolved segment rules · competitionFormat · pointMultipliers
timeline        point · game · set · endSegment · setInitialScore · setServer · substitution
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
  not parse still builds an engine, and point input is then refused (§ 2.1); v1 accepts the other
  inputs on it (**OPEN 10**).
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
  without one for a completed tie (§ 7), and stamps `endTime`.
- A set records `side1Score`/`side2Score` (games, points or units, by segment kind),
  `side1TiebreakScore`/`side2TiebreakScore` when a tiebreak was played, `winningSide` when won, the
  per-game point counts `side1GameScores`/`side2GameScores` of the games played point by point, and
  engine marks: `isTiebreakOnly`, `isTimed`, `segmentComplete` (a timed segment closed, with or
  without a winner) and `currentStreak` (a consecutive-points game in progress).
- `history.points` holds the materialized points (§ 11.1); `history.entries` is the timeline
  (§ 12.1); `history.substitutions` mirrors the substitution entries.

### 1.3 Sides

A side is named two ways: 0-indexed (`winner`, `server`: 0 is side 1) and 1-indexed (`winningSide`,
`serverSideNumber`: 1 is side 1). An input may use either spelling or both; both spellings must name
the same side (§ 2.1). A materialized point carries both.

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

The timeline is a closed set of seven action types. Each records only the facts its caller supplied.
Everything else the engine does is either a view (§ 11) or an edit of the timeline (§ 12.3–12.4).

| action            | caller-supplied facts                                                                                                         | refused (an error; nothing is written)                                |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `point`           | the winner; optionally the server, `serverParticipantId`, `scoreValue`, `timestamp`, `observedServeSide`, decorations (§ 2.1) | invalid sides or values (§ 2.1); a segment that takes no points (§ 8) |
| `game`            | `winner` (0 or 1); optionally `tiebreakScore` `[side1, side2]`, `timestamp`                                                   | a segment that takes no games: outs (§ 8), a combined total (§ 7)     |
| `set`             | `side1Score`, `side2Score`; optionally tiebreak scores, `winningSide`, `timestamp`                                            | a combined total that is invalid or already has its segment (§ 7)     |
| `endSegment`      | optionally `setNumber`, `timestamp`, `reason` (`time`, `mercy`, `manual`)                                                     | a combined total (§ 7)                                                |
| `setInitialScore` | `sets[]`, optionally `currentSetScore`, `currentGameScore`, `server`                                                          | a combined total whose baseline is invalid or has a game score (§ 7)  |
| `setServer`       | `side`, the side due to serve the next point                                                                                  | none; an unparseable format makes it a no-op                          |
| `substitution`    | `sideNumber`, `outParticipantId`, `inParticipantId`, optionally `timestamp`                                                   | none throw; four identity refusals return a result instead (§ 2.7)    |

**A recorded action clears the redo stack; a refused or ignored one records nothing and keeps it**
(§ 12.3). v1's `endSegment` keeps the redo stack and records an entry even when it changes nothing:
**OPEN 1**.

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
6. the set in play takes no point input (a segment of outs, § 8).

**Ignored: accepted, and nothing is recorded** (no point, no entry, no event, the redo stack kept):

1. a point that names no winner (`aCompletedMatchTakesCorrections.test.ts`, "a point the scorer
   ignores records nothing");
2. a point after the match is `COMPLETED` (every conformance file: "a point after the match ends
   changes nothing"; the corpus's post-completion point in all 72 streams);
3. in a non-aggregate exactly-N format, a point after all N sets are closed (`tiebreakSets`,
   "HAL2X-S:TB11 — a level count of halves");
4. in a combined total, a point after the segment completes (`combinedTotals`, "a rally after the total
   changes nothing"), or a point whose `scoreValue` is not 1: **OPEN 9**.

### 2.2 game

Adds one game (or unit) to the open set for the side `winner` names, creating the next set when the
last one has a winner. A game in progress point by point is abandoned: its points stay on the
history, and the set's next point opens a new game at 0-0 (`getEpisodesInterruptedGames.test.ts`,
"credits an interrupted game to no point"). A `tiebreakScore` is stored as the set's tiebreak points.
The set is then judged by its segment's rule (§ 4.2) and the match by § 9. In a timed segment a game
is a unit of its score (§ 6.2). v1 validates no field of a game, applies it to a match already
`COMPLETED` and to a timed segment already closed level, and counts a game in a tiebreak-only segment
as one of its points: **OPEN 4, 5, 10, 11**.

### 2.3 set

Appends a set total with its winner: the `winningSide` given, or the side the segment's rule makes the
winner of that total (for outs and timed segments the side with more; a level total names none). A set
with a winner triggers § 9. This is the only input a segment of outs takes (§ 8). In a
combined total the set is the one segment, validated by § 7. v1 infers a winner from any unequal
total, whether or not the segment's rule would call the set finished, and records sets after the
match is complete and past N in an exactly format: **OPEN 5, 6, 7**.

### 2.4 endSegment

Ends the timed segment in play, or the one `setNumber` names: § 6.4. v1 accepts it on any segment
kind: **OPEN 2**.

### 2.5 setInitialScore

A late-start baseline: the sets already played (each with its winner, or one inferred), the set in
play's games, and the game in play's points. It replaces the score as it stands and makes the matchUp
`IN_PROGRESS`. It is a timeline action: a rebuild replays it where it was set, it survives `setState`
alone, and `undo` removes it (`replayLossless.test.ts`, "S2: a late-start baseline survives reload and
is part of the timeline"). How v1 infers a baseline's set winners, whether a baseline can complete a
match, what a second baseline replaces, and the ignored `server` field are **OPEN 8**.

### 2.6 setServer

Names the side due to serve the next point; § 10.6 states what it does to the derivation. With
`recordEntry: false` it changes the orientation without a timeline entry: **OPEN 16**.

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

### 2.8 What is not an action

- **Corrections** are edits of the timeline, not new actions: `editPoint`, `removePoint`,
  `decoratePoint` (§ 12.4), and `undo`/`redo` (§ 12.3).
- **`setLineUp`** sets a side's lineUp and its initial snapshot, outside the timeline.
- **`reset`** starts a new matchUp with the same format and identity: no history, no redo, no lineUps.
- **`markHardBoundary`** is a deprecated annotation, removed at the next major; a rebuild discards it
  (`inputLevels.test.ts`, "S8: a hard boundary is an annotation").
- **Challenges and annotations.** The v2 plan names them as actions. v1 has no such type: a host
  (epixodic, `challenge` entries) writes its own entries into the timeline, which a rebuild keeps and
  does not replay, and which `undo` pops like any other entry: **OPEN 20**.

## 3. Format resolution: the rule for set n

### 3.1 The match

- **Best of N** (`SET3`, `MAP5`, …): the first side to win ⌈N/2⌉ sets wins. `SET1X` and `SET1XA` read as
  best of one (exactly one set is best of one).
- **Exactly N** (`X`): all N sets are played; a lead is not a win (§ 9.2).
- **Aggregate** (`A`): every set is played and the total across them decides; sets won are not
  consulted (§ 9.3). With `X` it is exactly N plus a decider (§ 9.4).
- **Standalone** (`T{minutes}`, `T{minutes}P`): one timed segment, best of one.

### 3.2 Which format governs a set

The ordinary format (`-S:`) governs every set except the one the final-segment format (`-F:`) governs:

1. **best of N**: the set played with both sides one set from winning (the deciding set), read from
   the score, not the set number;
2. **exactly N, not aggregate**: set N, by number, whatever the count before it
   (`timedSegments`, "SET4X-S:T20P-F:T20 — the fourth segment is scored in games … and must be played");
3. **exactly N, aggregate**: set N + 1, the decider, and never one of the N (§ 9.4;
   `aggregateSegments`, "the -F: format does not govern set three").

Every rule below reads the format governing the set in play. Scoring, the score situation, points-to,
server derivation and the input levels must agree on it: one predicate decides whether a standard set
is in its tiebreak (`tiebreakServiceOrder.test.ts`, "isStandardSetTiebreak"; `noTiebreakIsNoTiebreak.test.ts`).
v1's scoreboard reads the ordinary format instead: **OPEN 13**.

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

It never governs a tiebreak (§ 4.3, § 5).

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

v1 decides a set with a tiebreak by "a side has T + 1 games", which is the rule only when T ≥ S − 1:
**OPEN 19**.

### 4.3 The tiebreak game

A tiebreak to n is won by the first side to n points with the tiebreak margin: **one when it is No-Ad
(`TB{n}NOAD`) or when its target is one (`TB1`, sudden death, CA 2026-10-17), two otherwise** (Rule
5(b); `tiebreakMargin.test.ts`). One rule decides the margin for scoring, points-to, score entry and
the validators. It is scored point by point whatever the game format: a deuce cap or a
consecutive-points game does not reach it (`tiebreakSetVariants`, "the cap governs games, not the
tie-break"; "the tie-break at four all scores point by point"). It is recorded on the set as one more
game for its winner plus both sides' tiebreak points: `[7, 6, [7, 0]]`.

### 4.4 Point values

A point builds one point of a game whatever its `scoreValue` or multiplier. v1 records the value on
the point and ignores it: **OPEN 9**.

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
A game given as game input is **OPEN 11**.

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
3. **Level, with no tiebreak**: the segment is closed without a winner. In an aggregate format that is
   the rule: its total still counts (§ 9.3). Elsewhere what a level segment means for the match is
   **OPEN 3**.

Ahead at time, a segment that declares a tiebreak plays none (`timedSegments`, "T{minutes}P/TB{points}").

### 6.5 Recorded shape

A timed set carries `isTimed`, its score in games or units, and `segmentComplete` once closed. A
tiebreak at time adds tiebreak points as § 4.3 records them.

## 7. Combined totals

`SET1-S:P{n}` is one segment of rally points that ends when both sides' points total n (Americano,
Mexicano). The grammar admits it only as the single segment of a SET-root best of one, with no final,
game format, modifier or clock.

1. **A rally adds one point** to its winner. A point's value other than 1 is not supported (**OPEN 9**).
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
6. **Service**: none is derived; supply the server (§ 10.5).

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

The match is won by the first side to win ⌈N/2⌉ sets (Rule 7; `standardSets`, "Rule 7"). A set without
a winner (a timed segment closed level) counts for neither side.

### 9.2 Exactly N, not aggregate

1. Reaching ⌈N/2⌉ sets before all N are played is a lead, not a win (`tiebreakSets`, "in HAL3X a
   two-halves lead is not a win"; `timedSegments`, "exactly | timed").
2. Once all N sets are played, the side with more sets wins, however many it took; a sweep is a win
   (`tiebreakSets`, "a sweep included").
3. A level count names no winner (fixed 2026-10-17, #5529: v1 named side 1; `tiebreakSets`,
   "a level count of halves names no winner"). The suite pins the match as not complete; whether a level
   exactly-N match is complete without a winner, as a combined tie is, is **OPEN 18**.
4. No set beyond N is recorded: a point after N closed sets is ignored (`tiebreakSets`, "no half beyond
   N is recorded"). v1 records a set total past N: **OPEN 7**.

### 9.3 Aggregate

1. Every one of the N segments is played (exactly N, or N of a best of N). A lead in segments or in
   total is not a win (`aggregateSegments`, "a big first-half lead is not a win").
2. **The total decides; sets won are not consulted** (`aggregateSegments`, "winning three quarters of
   four is not consulted"; `tiebreakSets`, "SET3A-S:TB11 — aggregate").
3. A segment's total is its units: a timed segment's own score (games or points, including the unit a
   tiebreak at time added), and a tiebreak-only segment's points.
4. An unequal total after N segments wins. A level total names no winner and the match is not
   complete (`aggregateSegments`, "a level total names no winner"). What follows a level total without a
   decider is **OPEN 12**.

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

A completed match takes no more scoring input. A point is ignored (§ 2.1). v1 applies set and game
input to a completed match: **OPEN 5**. Corrections stay available: a completed match takes
`editPoint` and `decoratePoint` (`aCompletedMatchTakesCorrections.test.ts`, "a completed match takes
per-point corrections").

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

The opener is the side due to serve by the games of the sets before it (a tiebreak-only set counts as
one game), and within the set the Rule 5(b)
rotation of § 10.1 applies (`tiebreakServiceOrder.test.ts`, "a standalone tiebreak set, both opening
servers"; "a match tiebreak in lieu of the final set"). This is tennis's rule applied to every
tiebreak-shaped set; a sport's own service order (table tennis's two each, squash's winner serves) is
not modelled (§ 13), and whether to derive one at all for those sports is **OPEN 17**.

### 10.3 Timed segments

The server alternates by unit within a segment: game by game where points build games (§ 6.2 rule 2),
point by point otherwise. v1 opens each new segment from the closed segment's count, and plays its
tiebreak at time with no rotation: **OPEN 14**.

### 10.4 Rally scoring and combined totals

Under `@RALLY` and in a combined total no server is derived: a point records the server only when the
caller supplies it, and its S/R code is not derived. v1's `getNextServer()` still answers a side for
them: **OPEN 15**.

### 10.5 The court half

The expected court half (`serveSide`) is derived from the score before the point: `deuce` when the
points played in the game (or in the tiebreak, or in a tiebreak-only set) are even, `ad` when odd; in an
aggregate format of untimed sets, from the parity of the aggregate total so far; none in a timed
segment. v1 writes the aggregate rule for INTENNSE, whose segments are timed, so it never applies to
INTENNSE (**OPEN 14**). A No-Ad deciding point, where the receiver chooses, is still reported as
`deuce`. A caller that saw the half supplies `observedServeSide`, recorded beside it (S7, CA 2026-10-17;
`substitutionAndService.test.ts`, "S7").

### 10.6 Orientation: the first explicit server and setServer

The derivations above assume side 1 serves first. The orientation is read in this order:

1. **`setServer(side)`**: at its position on the timeline, the orientation becomes "flipped" exactly
   when `side` differs from the base derivation there; it governs from that point on and replaces rule 2.
   It is replayed at its position on every rebuild (`tiebreakServiceOrder.test.ts`, "a set tiebreak
   opened by side 2 after a setServer correction"; "survives undo, redo and reload, including a
   mid-tiebreak setServer correction"; `setServer-recordEntry.test.ts`).
2. **The first recorded point's supplied server**: if it differs from the base derivation at that
   point's position, every derivation is flipped. A match that starts mid-tiebreak is not placed
   correctly by this rule (a known limit of #5512).
3. Otherwise side 1 serves first.

### 10.7 The competition's rule

Under `serverRule: WINNER_SERVES` the server of a point is the winner of the point before it, and side
1 for the first point. The engine supplies that server to the scorer, so the server shown
(`getNextServer()`), the server recorded and the server a rebuild derives agree; it is calculated, not
recorded (S5, #5517). A server the caller supplies is recorded as played, and the rule resumes after it
(`scoringAgreement.test.ts`, "S5: the competition server rule decides the recorded server too").

### 10.8 The S/R code

A point with a known server and no `code` is coded `S` when the server won it and `R` when the receiver
did.

## 11. Views and events

Views are derived from the state and never recorded as inputs.

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
  `pointsToMatch` (the set's points plus the remaining sets at their minimum).
- `isBreakpoint`: the receiver needs one point to win the game.
- The score situation for the next point: `isGamePoint` (the server needs one), `isBreakPoint`,
  `isSetPoint`, `isMatchPoint` (either side needs one), `isGoldenPoint` (both need one, under No-Ad or a
  deuce cap outside a tiebreak), `isTiebreak`, and `server`.
- A timed segment has no points-to: every situation flag is false. A combined total's match point is a
  rally that would complete it with a winner, and its golden point is the `DP` rally.

v1 counts points-to-match by best-of sets in exactly and aggregate formats: **OPEN 13**.

### 11.3 Score strings, scoreboard, episodes, statistics

- The score string joins the sets, a set with a tiebreak showing the loser's tiebreak points (`7-6(3)`).
- `getScoreboard()` adds the game in play: **OPEN 13** for v1's reading of the format.
- `getEpisodes()` enriches each point with its game, set and match context; a game interrupted by
  `addGame` or `addSet` is credited to no point, and a set is complete on the point that won it
  (`getEpisodesInterruptedGames.test.ts`).
- Statistics count each point result in exactly its own categories (S12, `scoringAgreement.test.ts`);
  standalone enrichment keeps what a point recorded and fills only missing context (S13).

### 11.4 Input levels and input mode

`getInputLevels()` reports § 3.3 for the set in play. `getInputMode()` reports which inputs the
timeline holds (`points`, `games`, `sets`, `mixed`, `none`), not counting baselines and segment ends;
v1 counts a server correction and a substitution as inputs: **OPEN 13**.

### 11.5 Events

Handlers fire synchronously after the action, with the state and the score.

| event                         | fires                                                                                             |
| ----------------------------- | ------------------------------------------------------------------------------------------------- |
| `onPoint`                     | a point is recorded (never for a refused or ignored point)                                        |
| `onGameComplete`              | that point completed a game, with `gameWinner` the side that won the point (either spelling, S11) |
| `onSetComplete`               | that point completed a set with a winner, with `setWinner`                                        |
| `onMatchComplete`             | that point completed the match with a winner, with `matchWinner`                                  |
| `onMatchTie`                  | that point completed the match without a winner (§ 7)                                             |
| `onUndo`, `onRedo`, `onReset` | their action succeeded; a rebuild re-emits no historical point events                             |

They fire in that order on one point. Game, set, baseline and segment-end actions fire no scoring
events (`scoringAgreement.test.ts`, "S11"; `event-handlers` page). v1 fires `onGameComplete` on every
point of a points-based timed segment, whose score is not games: **OPEN 13**.

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
is kept in place and not replayed (§ 2.8).

### 12.2 What a point entry holds

Every field the caller supplied, including fields beyond the typed options, and no calculated field
(§ 1.4). A rebuild replays the entry as recorded: its value, flags and decorations survive undo, redo,
`editPoint`, `removePoint` and a reload (`replayLossless.test.ts`, "S1"). **The entry is authoritative
over the materialized point**: a point's calculated values are a cache, and a rebuild recomputes them
(R2, decision 4; `tiebreakServiceOrder.test.ts`, "tiebreak servers on records saved under the old
rotation").

### 12.3 Undo and redo

- `undo(n)` moves the last n entries, of any type, to the redo stack (a `point` entry takes its point
  with it) and rebuilds. It returns false when there is nothing to undo.
- `redo(n)` moves the last n back onto the timeline and rebuilds.
- A recorded action clears the redo stack (point, game, set, baseline, server correction,
  substitution); a refused or ignored action keeps it. v1's `endSegment` does not clear it, and records
  an entry when it changes nothing: **OPEN 1**.
- Undo and redo cross game, set and tiebreak boundaries, and a mix of input levels, as one timeline
  (`undo-redo.test.ts`).

### 12.4 Corrections

- `editPoint(i, data)` refuses invalid data before anything changes (§ 2.1), writes every field given
  to the point and to its entry, and rebuilds. A winner or server edited in one spelling clears the
  other spelling on the entry, so the replay reads the edit. With `recalculate: false` the score is left
  as it was until the next rebuild, which applies the edit (`aCompletedMatchTakesCorrections.test.ts`).
- `removePoint(i)` removes the point and its entry, renumbers the later point entries, and rebuilds.
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

### 12.6 Every persisted shape v2 must read

1. **An entries-based record** (`history.entries` present): rebuilt from its entries. Its point entries
   may predate S1 (#5515) and hold fewer fields; the entry is still authoritative.
2. **A legacy point-only record** (points, no `entries`): loaded as stored. Without a timeline,
   `undo` pops points (the redo stack holds each point's replay input), `redo` re-adds them through the
   scorer, and a correction rebuilds from the points. A point's replay input is every field except the
   calculated ones of § 1.4, so its stored `scoreValue` (the effective value) and its stored `server`
   replay as given, and the old result stands (`replayLossless.test.ts`, "a record with no timeline
   replays its points with their recorded facts"). **The first recorded action on such a record first
   builds a timeline from its points**, so a later rebuild keeps them ("a new point on a record with no
   timeline keeps the points before it through a rebuild").
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
7. **Foreign entries** a host wrote into the timeline (epixodic's `challenge`): kept, not replayed.
8. **`hardBoundaries`** on a set: read and ignored; a rebuild discards them (§ 2.8).

### 12.7 Determinism

A replay uses the recorded timestamps. An action without one is stamped by the clock, as is `endTime`
on completion, so a reproducible stream sets the clock (the corpus does). Nothing else in scoring reads
the clock or a random source.

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
- **A sport's own service order** in a tiebreak-shaped set (§ 10.2), and the receiver's choice of court
  half on a No-Ad deciding point (§ 10.5).
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
| v2's reducer never mutates its input; the published pure `addPoint` keeps its in-place behaviour through 7.x and retires at 8.0.0 (plan § 8.4)            | —             |

## 15. What the suite and the corpus pin

|                    |                                                                                                                                                                                        |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| conformance matrix | 79 cells from the factory's harvested formats: 75 held by independent cases, 4 refused, none missing (`formatMatrix.test.ts`); every cell placed in § 17                               |
| conformance cases  | about 300, written from rulebooks (ITF, USA Pickleball, World Squash, ITTF, BWF, FIVB, VALORANT) or from the format definitions, each held five ways (see the opening)                 |
| engine tests       | the S1–S13 fixes (#5511–#5521), the defects the cases found (#5529, #5530, #5533) and the replay, boundary and service tests cited above                                               |
| scoring corpus     | 72 seeded streams (8 formats × 3 biases × 3 seeds) through the pure `createMatchUp`/`addPoint`, each step's result pinned by the manifest (#5511), and one point after completion each |
| not yet pinned     | the class timeline (undo, redo, edits, baselines, segment ends, server corrections, substitutions, save and load) as corpus scenarios: SE3                                             |

## 16. OPEN — decisions for CA

Each states the rule this page proposes, v1's behaviour and the evidence. Probes ran on factory `dev`
at `0fcd079843`, 2026-10-18; the stream is given so each reproduces.

1. **`endSegment` and the redo stack.** Rule: a recorded action clears the redo stack, and an action
   that changes nothing records nothing. v1: `endSegment` keeps the redo stack, so `SET3-S:T10P`
   point, point, undo, `endSegment`, redo replays the undone point after the segment end, into set 2; and
   `endSegment` with no set in play records an entry (`setNumber: 0`) that `undo` then pops.
2. **`endSegment` on a segment that is not timed.** Rule proposed: it ends timed segments only, and is
   refused elsewhere, unless `reason: 'mercy' | 'manual'` is to mean ending any segment (decide). v1:
   closes a `SET3-S:6/TB7` set at 2-1 for side 1, and closes a `SET3-S:TB11` set in play at 5-3 as level
   0-0, its points dropped.
3. **A level timed segment with no declared tiebreak, outside aggregate.** v1 closes it without a winner
   and opens another segment: `SET1-S:T10P` level at time takes a second set, and `SET3-S:T10` level in
   set one opens set two at no sets each, so a best of three can need a fourth. In an
   exactly-N format such a segment never counts toward the N played, since v1 counts sets with a winner.
   Decide: may a best-of match end level, does a level segment count as played, or must the host decide it?
4. **Input into a closed timed segment.** Rule: a closed segment takes no input. v1: `addGame` ignores
   the closed mark, adds to the level segment and lets `endSegment` re-close it with a winner
   (`SET3-S:T10`: games 1-1, end, game, end gives set one 2-1).
5. **Set and game input after completion.** Rule: a completed match takes no scoring input (ignored as a
   point is, or refused: decide). v1: after `SET3-S:6/TB7` 6-0 6-0, `addSet` appends a third set and
   `addGame` a fourth; the match stays `COMPLETED`.
6. **`addSet`'s winner.** Rule proposed: a set total is judged by its segment's rule; one the rule does
   not call finished is refused or recorded open (decide). v1 infers a winner from any unequal total
   (`SET3-S:6/TB7`: 3-1 and 2-0 complete the match), though its JSDoc says it validates against the
   format; and a level total leaves the set open, so `SET3-S:T10P` `addSet` 2-2 then a point gives 3-2.
7. **Exactly N: set totals past N.** Rule: no set beyond N (as for points). v1: `HAL2X-S:TB11` takes three
   `addSet` halves and completes 2-1.
8. **The late-start baseline.** Rule proposed: a baseline's sets are judged by their segment rule (the
   final format by the deciding-set rule of § 3.2), and a baseline that decides the match completes it.
   v1: a set "reached setTo and ahead" is won, so 6-5 is a won set; the final set is read by position, not
   score; a tiebreak-only set is never inferred, so `SET3-S:TB11` 1-0 (11-9) stays open and takes the
   next point; 6-0 6-0 is not completed and the next point opens a third set; a second baseline replaces
   the whole score, including games points have scored since (`SET3-S:6/TB7`: baseline 2-1, a game, a
   baseline 4-4 leaves 4-4 with four points in history); and `server` is ignored.
9. **Point values where they do not apply.** Rule proposed: a `scoreValue` other than 1 is refused where
   a point is not a unit (a game-building segment, a combined total), or recorded and documented as
   ignored (decide). v1: in `SET3-S:6/TB7` two points of value 2 are 30-0, with `scoreValue: 2` recorded
   on each; in `SET1-S:P32` a point of value 2 is silently ignored, nothing recorded, though the docs
   call it unsupported.
10. **Validation of the other actions.** Rule: every action refuses invalid facts before writing, as
    `addPoint` does (S9 covered `addPoint` and `editPoint`). v1: `addGame({ winner: 2 })` scores for
    side 2; `addSet`, `endSegment` and `setInitialScore` are not validated; and on a format that does
    not parse only `addPoint` refuses (`addGame` there adds a game).
11. **A game in a tiebreak-only segment.** Rule proposed: a game given there is the segment, won 1-0,
    with `tiebreakScore` as its points; or game input is refused there (decide). v1: the input levels say
    yes, and `addGame` adds 1 toward the target, so `SET3-S:TB11` needs eleven `addGame` calls for a set.
12. **A level aggregate total with no decider.** The docs: "a tied total names no winner until a
    deciding point breaks it". v1 plays further segments of the ordinary format until the totals differ:
    `SET3A-S:TB11` level 24-24 after three games takes a fourth game and completes; `HAL2A-S:T45` level
    after two halves takes a third. An `XA` format without `-F:` does the same at set N + 1. Decide: end
    level, play on, or require a decider.
13. **Views that do not read the one rule.** Rule: every view reads the format governing the set in play
    and the match's completion rule. v1: (a) `getScoreboard()` reads the ordinary format and tennis
    points, so `SET3-S:TB11` at 5-3 shows `0-0 (G-40)`, and a `-F:4/TB7` final-set tiebreak shows
    `(40-15)` while the situation says tiebreak; (b) points-to-match counts best-of sets, so
    `HAL3X-S:TB11` at one half to love and 10-0 reports a match point, and `SET3A-S:TB11` at two games
    to love and 9-0 decorates the point with `pointsToMatch` `[0, 22]`, side 1 needing none;
    (c) `onGameComplete` fires on every point of a points-based timed segment (`SET3-S:T10P`: three points, three events); (d) `getInputMode()`
    counts `setServer` and substitutions, so a point-only match with one correction is `mixed`.
14. **Service in timed segments.** v1 derives the first point of a new segment from the closed
    segment's count, so `SET3-S:T10P` serves 0, 1, 0 in segment one and 1, 1 in segment two; and the
    tiebreak at time has no rotation (`SET3-S:T20/TB7`: 0, 0, 0, 0). And the court-half rule for
    aggregate formats (the INTENNSE rule) is never reached for a timed segment, so `SET7XA-S:T10P` points
    carry no `serveSide`. Decide each segment's opener, whether Rule 5(b) applies to a tiebreak at time,
    and whether the aggregate court-half rule applies to timed aggregate segments.
15. **No derived server under `@RALLY` and in a combined total.** v1 records none, but `getNextServer()`
    answers a side (`SET3-S:TB11@RALLY` after two points: 1). Rule proposed: the query answers none, or
    both derive (decide).
16. **A correction without a timeline entry.** v1: `setServer(side, { recordEntry: false })` changes the
    orientation, and the next rebuild loses it (`SET3-S:6/TB7`: servers 1, 1, then after one undo the
    surviving point's server is 0). The API docs say only that it is "not an independently undoable
    action". Decide whether it survives a rebuild (and so needs a record) or the host re-applies it, as
    INTENNSE does after every point.
17. **Service in non-tennis tiebreak-shaped sets.** v1 applies tennis's Rule 5(b) rotation, the S/R
    code and break points to every tiebreak-only set (`SET5-S:TB11` squash, `SET7-S:TB11` table tennis).
    Decide: keep it as the default, or derive no server unless the format is tennis's.
18. **Is a level exactly-N match complete?** The suite pins a level `HAL2X-S:TB11` as not complete, and a
    level aggregate likewise, while a combined tie is `COMPLETED` without a winner. Decide whether
    "names no winner" means a completed draw or a match still open.
19. **A tiebreak below setTo − 1** (`@T` with T < S − 1). The grammar accepts it; no matrix cell holds
    it. v1's set rule ("a side has T + 1 games") then closes a set below S without a tiebreak (5-3 for
    `@4` in a set to 6). Decide what such a code means, or refuse it. Two more rules no cell exercises:
    a consecutive-points game format in a timed set (v1 builds traditional games), and an aggregate of
    standard sets (v1 sums the tiebreak points of a set that had a tiebreak, its games otherwise).
20. **Challenges and annotations as actions.** The plan's action set lists them; v1 has neither, and
    epixodic writes `challenge` entries into the timeline itself (#404(epixodic)), which `undo` pops like
    a point. Decide the action and whether undo skips it.
21. **Docs and code that disagree** (no behaviour decision, but the docs change): the API page says to
    provide `winner` or `winningSide`, "not both", while v1 accepts both when they agree; `addSet`'s
    JSDoc says it validates against the format (OPEN 6); and the fixture comment on
    `FORMAT_STANDARD_NOAD` (`SET3-S:6NOAD`) says "deciding game at 5-5", where the code is an advantage
    set with no tiebreak.

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
- `bestOf | SET | set:timed(G) | final:timed(G) | game:traditional | noClock | knownModifiers` — § 3.2, § 6.1, § 6.4; `timedSegments` (`SET3-S:T20-F:T60`, `SET3-S:T15-F:T10`)
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
