# Standings

## Overview

Every table the factory orders is ordered by one **standings engine**:

| Table                                          | Where                                                                                    | Policy                                               |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| A round-robin group                            | `tallyParticipantResults`, written to each position assignment's `tally` on every result | the round-robin tally policy                         |
| A season table (per tier)                      | `seasonGovernor.getSeasonStandings`                                                      | a season's or tier's `tallyPolicy` (the same policy) |
| A competition leaderboard (Swiss, DrawMatic)   | `getCompetitionLeaderboard`                                                              | the competition policy's `victoryPolicy`             |
| The best finishers of a position across groups | playoff entry selection (best-of playoffs)                                               | the tally policy's `crossGroup`                      |

A standing is a **pure function of the results**: nothing is folded into stored state as results arrive, so a corrected
result counts once, as corrected, and a removed result does not count. What is stored on a record (a tally, a
competition state) is a cache of that function.

The engine is sport-agnostic. It reads results, not a sport: wins, draws, sets, games or points, and the statuses a
result ended with. The [sports section](#sports-and-competitions) below sets out which competitions' rules it can express
today, and which it cannot yet.

## How an order is decided

1. **The ledger.** Each participant's results are counted: matchUps won, lost and drawn; sets, games and points; lines
   of a TEAM matchUp; walkovers, defaults and retirements; the opponents beaten, lost to and drawn with. A policy can
   add classification points per result (`resultPoints`).
2. **The primary measure** (`groupOrderKey`) partitions everyone, higher first.
3. **Disqualification.** With `disqualifyWalkovers` / `disqualifyDefaults`, a participant who conceded one is ordered
   below everyone who did not.
4. **Directives** refine each tied set, in order. The first directive that separates a set decides it. A directive can
   read the whole table or only the meetings among the tied participants (`idsFilter`: a mini-league).
5. **Splits.** When a directive separates some of a tied set, `onSplit` decides what happens to each smaller set:
   - `RESTART` (default): it goes back to the first directive.
   - `CONTINUE`: it resumes with the next directive.
   - `EXTRACT_ONE`: one participant is placed at a time.
6. **The final step** (`terminal`) settles a set no directive separates:
   - an organiser's sub-order (`ADJUDICATE`, the default);
   - a shared place (`SHARE`);
   - a draw seeded so it is reproducible (`LOT`).
7. **Positions** are competition ranks: participants level on everything share a place (1, 2, 2, 4).

While results are outstanding the order is **provisional** (`provisionalOrder`), and directives marked
`when: { phase: 'FINAL' }` wait for the end. A group is complete when every meeting has a result, so a double round robin
completes like a single one.

## Measures

| Kind                     | Measures                                                                                                                                                                                                                             | Stored on the tally        |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------- |
| Counts                   | `matchUpsWon`, `matchUpsLost`, `matchUpsDrawn`, `setsWon`, `setsLost`, `gamesWon`, `gamesLost`, `pointsWon`, `pointsLost`, `tieMatchUpsWon`, `tieSinglesWon`, `tieDoublesWon`, `walkovers`, `defaults`, `retirements`, `allDefaults` | yes                        |
| Percentages              | `matchUpsPct` (a draw counts `drawCredit`), `setsPct`, `gamesPct`, `pointsPct`, `tieMatchUpsPct`                                                                                                                                     | yes                        |
| Differences              | `setsDiff`, `gamesDiff`, `pointsDiff`                                                                                                                                                                                                | yes                        |
| Points by result         | `classificationPoints` (from `resultPoints` rules), `standingsPoints` (from `outcomePoints`)                                                                                                                                         | yes                        |
| Ratios                   | `setsRatio`, `gamesRatio`, `pointsRatio`                                                                                                                                                                                             | no: computed when ordering |
| Strength of schedule     | `buchholz`, `buchholzCut1`, `buchholzMedian`, `sonnebornBerger`                                                                                                                                                                      | no: computed when ordering |
| Common opponents         | `{ attribute: 'commonOpponents', minSample }`: the record against the opponents every tied participant met                                                                                                                           | no: computed when ordering |
| Groupings                | `groupLeader`, `recordVsGroup` (`groupBy`) and `recordVsSet` (`setKey`), from the caller's `groupings`, `groupRanks` and `participantSets`; `preReduce: { groupBy }`                                                                 | no: computed when ordering |
| Head-to-head             | `{ attribute: 'headToHead', mode }`, mode `RECORD` or `SWEEP`                                                                                                                                                                        | no                         |
| From outside the results | `{ attribute: 'external', externalKey }`, values supplied by the caller                                                                                                                                                              | no                         |

A season table adds `valueWon` and `valueLost`: the TEAM tie score summed (lines, points or games won).

Precision is a rule, not a display setting: percentages and ratios equal to `precision` decimal places (default 3) tie,
and `precision: 'EXACT'` compares them unrounded. A percentage with nothing played is 0; a ratio with nothing lost ranks
first, unless a directive's `zeroDivision` says otherwise.

The full policy reference, with every field, is [Round Robin Tally Policy](../policies/roundRobinTallyPolicy.md).

## A policy at a glance

```js
{
  roundRobinTally: {
    groupOrderKey: 'classificationPoints',
    resultPoints: { rules: [{ id: 'win', winner: 3, loser: 0 }, { id: 'draw', isDrawn: true, points: 1 }] },
    tallyDirectives: [
      { attribute: 'classificationPoints', idsFilter: true }, // the mini-league among the tied
      { attribute: 'pointsDiff', idsFilter: true },
      { attribute: 'pointsDiff' },
      { attribute: 'pointsWon' },
    ],
    onSplit: 'RESTART',
    terminal: 'LOT',
    crossGroup: [{ attribute: 'classificationPoints' }, { attribute: 'pointsDiff' }],
  },
}
```

A policy is checked where it is saved (`attachPolicies`, `validateSeason`, or `validateTallyPolicy` on its own): an
unknown measure, a malformed directive or invalid result rules are refused before anything is written.

## Sports and competitions

The engine was designed against the published standings rules of competitions across sports, not only tennis. For each
one below, the table gives what its rules need, how a policy expresses that, and whether the engine supports it today.

- **Supported**: the whole procedure can be written as a policy.
- **Partial**: the main procedure can, but a named step needs data or a feature the engine does not have yet.
- **Not yet**: the deciding criterion depends on data the factory does not record.

Rulebooks are named by document and edition. Where the rule set was read only in secondary sources, it is marked so;
presets are written only from rulebooks read at source.

### Racquet sports

| Competition                                                                                   | Rules                                                                                                                                                                                                               | How a policy expresses them                                     | Status                                |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------- |
| **USTA League championships** (USTA/Midwest Section 2026 League Regulations, Combo M)         | most lines won, the head-to-head match, fewest sets lost, fewest games lost, then sets and games lost in the head-to-head match, a coin toss; defaults count 6-0 6-0; a match tie-break counts one set and one game | preset `POLICY_ROUND_ROBIN_TALLY_USTA_LEAGUE`                   | **Supported**                         |
| USTA section variants (secondary sources)                                                     | Georgia adds game-winning percentage; Southern California applies head-to-head only as a sweep                                                                                                                      | `gamesPct`; `headToHead` mode `SWEEP`                           | **Supported**                         |
| USTA withdrawn teams (Midwest 2026)                                                           | a team that defaults out is expunged, unless every contender has already played it                                                                                                                                  | needs who withdrew, which the results do not carry              | **Not yet**                           |
| USTA Junior Team Tennis                                                                       | games won, head-to-head, team matches, lines, sets                                                                                                                                                                  | preset `POLICY_ROUND_ROBIN_TALLY_JTT`                           | Supported (not re-verified at source) |
| Round-robin events (default policy, TOC)                                                      | matches, then sets, games and points percentages, overall and among the tied                                                                                                                                        | the default policy; preset `POLICY_ROUND_ROBIN_TALLY_TOC`       | **Supported**                         |
| Davis Cup / Billie Jean King Cup Finals groups (2019–2024; the Finals are knockout from 2025) | for three tied: matches, sets, games; for two: the head-to-head tie                                                                                                                                                 | `minParticipants` / `maxParticipants` on the directives         | **Supported**                         |
| Pickleball team leagues (MLP; sources conflict)                                               | game difference, or match then game percentage                                                                                                                                                                      | `gamesDiff`, `matchUpsPct`, `gamesPct`                          | Supported mechanisms; no preset       |
| Box and ladder leagues                                                                        | a table per box, promotion and relegation between boxes                                                                                                                                                             | season tables with `movementRules` (see [Seasons](./season.md)) | **Supported**                         |

### Team sports

| Competition                                                                                                       | Rules                                                                                                                                                                                                                               | How a policy expresses them                                                                                                                                                                                                                                  | Status                                                                                                                                                                                                      |
| ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Basketball, FIBA** (Official Basketball Rules 2026, Appendix D)                                                 | 2 points a win, 1 a loss (default included), 0 a forfeit; the games between the tied, their points difference and points scored, then overall; restart on any separation; then the FIBA ranking or a draw                           | preset `POLICY_ROUND_ROBIN_TALLY_FIBA`; the FIBA ranking as an `external` value                                                                                                                                                                              | **Supported**                                                                                                                                                                                               |
| Basketball, NBA (NBA tie-break rules)                                                                             | win percentage; head-to-head; division winner first; record against playoff teams                                                                                                                                                   | `matchUpsPct`, the head-to-head mini-league, `RESTART`                                                                                                                                                                                                       | **Supported** with the caller's divisions, division ranks and postseason-eligible set (`groupLeader`, `recordVsGroup`, `recordVsSet`); the eligible set depends on the standings, so the caller computes it |
| **Volleyball, FIVB** (VNL 2026 Competition Regulations § 2.5)                                                     | victories; 3 points for a 3-0 or 3-1 win, 2 and 1 for a 3-2, 0 for a forfeit; set ratio; point ratio; the matches among the tied; the FIVB World Ranking                                                                            | preset `POLICY_ROUND_ROBIN_TALLY_FIVB`; `resultPoints` with `loserSetsWon`; `setsRatio`, `pointsRatio` (an unbeaten ratio ranks first); the World Ranking as an `external` value                                                                             | **Supported**                                                                                                                                                                                               |
| **Football: league tables** (Premier League Handbook 2025/26, MLS 2026 Competition Guidelines, UEFA league phase) | 3 points a win, 1 a draw; goal difference; goals scored; in some, head-to-head or criteria applied only at the end or only for a title or relegation place; MLS ranks on wins first and adds disciplinary points                    | presets `POLICY_ROUND_ROBIN_TALLY_PREMIER_LEAGUE` and `POLICY_ROUND_ROBIN_TALLY_MLS`; goals are each half's score (`HAL2A-S:T45`), so goal difference is `gamesDiff`; `when: { phase }` and `when: { purposes }`; disciplinary points as an `external` value | **Supported**, except steps that need a home or away side (away goals)                                                                                                                                      |
| Football: head-to-head-first tables (La Liga, FIFA, UEFA EURO; partly secondary sources)                          | the tied teams' games first, re-applied to any residue, then overall                                                                                                                                                                | a mini-league with `onSplit: 'CONTINUE'`                                                                                                                                                                                                                     | Supported mechanisms                                                                                                                                                                                        |
| American football, NFL (NFL tie-breaking procedures)                                                              | head-to-head sweep; one team advanced per step; division leaders first; common opponents; strength of victory and schedule; a coin toss                                                                                             | `preReduce: { groupBy: 'division' }`, `headToHead` mode `SWEEP`, `recordVsGroup`, `commonOpponents` with `minSample: 4`, `onSplit: 'EXTRACT_ONE'`, `terminal: 'LOT'`                                                                                         | **Partial**: strength of victory is not built                                                                                                                                                               |
| Ice hockey, NHL and IIHF                                                                                          | points percentage; regulation wins; 3-2-1-0 points by regulation or overtime result                                                                                                                                                 | `matchUpsPct`-style percentages; head-to-head among the tied; 3-2-1-0 as rules on `decidedIn` (`REGULATION`; `OVERTIME`, `DECIDER`) over an overtime format such as `PER3XA-S:T20P-O:1SD/T5P-F:SO5`                                                          | **Supported** for the points: the format records whether a result was decided in regulation, overtime or the shootout. IIHF's record against the best-placed team outside the tied set is not yet (below)   |
| Handball (EHF / IHF; secondary sources)                                                                           | 2-1-0 points; head-to-head among the tied, restart                                                                                                                                                                                  | `resultPoints`, the mini-league, `RESTART`                                                                                                                                                                                                                   | Supported mechanisms                                                                                                                                                                                        |
| Rugby union (Six Nations championship rules, PREM league table regulations; read at source 2026-11-04)            | 4 a win, 2 a draw; 1 for losing by 7 or fewer and 1 for four tries, both possible in one match; Six Nations: points difference, then tries; PREM: wins, points difference, points scored, then the points scored against each other | points are each half's score (`HAL2A-S:T40`), so points difference is `gamesDiff`; `resultPoints` with a `bonus` rule and `loserMarginAtMost` for the losing bonus; `matchUpsWon`, `gamesDiff`, `gamesWon`                                                   | **Partial**: the losing bonus is expressible; the four-try bonus needs try counts, which a score does not record                                                                                            |
| Cricket (ICC, IPL; not verified at source)                                                                        | net run rate                                                                                                                                                                                                                        | needs runs and overs per innings                                                                                                                                                                                                                             | **Not yet**                                                                                                                                                                                                 |

### Individual and mind sports

| Competition                                                                               | Rules                                                                                                         | How a policy expresses them                                                                                                                                                                           | Status                                                                                        |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| **Chess, Swiss and round robin** (FIDE Handbook C.07 Tie-Break Regulations, 2024 edition) | direct encounter, re-applied within subsets; Buchholz with Cut-1 and Median; Sonneborn-Berger; number of wins | the head-to-head mini-league; `buchholz`, `buchholzCut1`, `buchholzMedian`, `sonnebornBerger`; `matchUpsWon`. The competition leaderboard maps `BUCHHOLZ` and `SONNEBORN_BERGER` to the same measures | **Partial**: the virtual opponent for unplayed rounds and the progressive score are not built |
| Curling (Olympic round robin)                                                             | wins; head-to-head; the Draw Shot Challenge                                                                   | the head-to-head mini-league; the Draw Shot Challenge as an `external` value (lower is better: `reversed`)                                                                                            | **Supported**                                                                                 |
| Esports group stages                                                                      | head-to-head, then a tiebreaker match where advancement depends on it                                         | the head-to-head mini-league; a tiebreaker match is a played result, and until it is played the organiser's sub-order (`ADJUDICATE`) holds                                                            | **Supported**                                                                                 |

### A level result where a winner must advance

A format that can end level (a football match, a timed set) may be played where a winner must advance: an elimination
structure, or a playoff. A level result there is **decided outside the score**: the sporting score is kept as played,
the winner is named, and `score.overtime` records how it was decided.

```js
outcome: {
  matchUpStatus: 'COMPLETED',
  winningSide: 1,
  score: {
    sets: [/* the halves, 1-0 and 0-1 */],
    overtime: { decidedIn: 'EXTERNAL', decidedBy: { method: 'SHOOTOUT', tally: [4, 3] } },
  },
}
```

- `decidedBy.method` is `SHOOTOUT` (with its `tally`, side 1 first, which the winner won), `COMPETITION_RULE` (the
  rule in `rule`: the better-placed side advances, away goals), `LOTS` or `OFFICIAL_DECISION`. A `note` may say more.
- Only a level score is decided this way: a score that decides the match, or is not complete, is refused
  (`ERR_INVALID_SCORE`). In a format that declares overtime (`-O:`), regulation must be played, the total level, and
  no overtime period or decider played may have decided it: a match abandoned level in overtime, or a shootout
  recorded outside the format.
- Where a winner must advance, a level result without that record is refused with `ERR_UNDECIDED_LEVEL_RESULT`. There
  is no status for a result awaiting a decision: the matchUp stays as it was until the decision is entered.
- A TEAM dual's score is the aggregate its lines produce. A decision recorded on a level dual needs only the record
  (`score: { overtime: { decidedIn: 'EXTERNAL', decidedBy } }`): a score given to a dual without `sets` is laid over the
  aggregate, which is kept as played, and does not replace it. An explicit clear (both score strings `''`) still clears.
- In a round robin a level result is a draw; one decided outside the score is the winner's win, and a standings rule
  can award it differently (`decidedIn`, `decidedBy`: see the
  [round robin tally policy](../policies/roundRobinTallyPolicy.md)).
- The record is the overtime workstream's: a format that declares overtime (`-O:`) stamps `decidedIn` itself
  (`REGULATION`, `OVERTIME`, `DECIDER`). Either way `score.overtime.scoreString` reads the result: `1-1 (Shootout: 4-3)`
  for a format that totals its periods, the set scores and the method (`2-1 1-2 1-1 (Lots)`) for one that counts sets.
- A period that finished 0-0 (a goalless half, a scoreless period or overtime) is recorded as played, so enter every
  period. In a match in progress a trailing 0-0 period is kept once it is closed or play follows it.
- A declared overtime with no decider can finish level (`HAL2XA-S:T45P-O:2/T15P`, 1-1 after extra time): that is a
  draw in a round robin, and needs a decision where a winner must advance.

### Not yet supported, and why

Each of these needs an input the factory does not have yet, not a change to how the engine orders:

- **Withdrawn and expunged participants** (USTA's conditional expunge): needs who withdrew.
- **Record against the best-placed team outside the tied set** (IIHF): depends on the order being computed.
- **Result categories that need data a score does not record** (rugby's four-try bonus): the tries are not recorded.
- **Rates from match statistics** (cricket's net run rate): needs the statistics.
- **Unplayed rounds in chess** (FIDE C.07 Art. 16, the dummy opponent): built for Swiss draws in `getSwissStandings`
  (see [Swiss](./draw-types/swiss.md#unplayed-rounds)), not for the standings engine's round-robin graph measures,
  where FIDE's Art. 15.2 counts a forfeit as a game.
