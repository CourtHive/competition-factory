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

| Competition                                                                              | Rules                                                                                                                                                                                                     | How a policy expresses them                                                                                                                                                                                                                                  | Status                                                                                                                |
| ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| **Basketball, FIBA** (Official Basketball Rules 2026, Appendix D)                        | 2 points a win, 1 a loss (default included), 0 a forfeit; the games between the tied, their points difference and points scored, then overall; restart on any separation; then the FIBA ranking or a draw | preset `POLICY_ROUND_ROBIN_TALLY_FIBA`; the FIBA ranking as an `external` value                                                                                                                                                                              | **Supported**                                                                                                         |
| Basketball, NBA (NBA tie-break rules)                                                    | win percentage; head-to-head; division winner first; record against playoff teams                                                                                                                         | `matchUpsPct`, the head-to-head mini-league, `RESTART`                                                                                                                                                                                                       | **Partial**: division-winner priority and record against playoff teams need groupings the engine does not have yet    |
| Volleyball (FIVB regulations)                                                            | 3 points for a 3-0 or 3-1 win, 2 and 1 for a 3-2, 0 for a forfeit; wins; set ratio; point ratio                                                                                                           | `resultPoints` with `loserSetsWon`; `setsRatio`, `pointsRatio` (an unbeaten ratio ranks first)                                                                                                                                                               | **Supported** (FIVB's final step not verified)                                                                        |
| Football: league tables (Premier League Handbook, UEFA league phase, MLS)                | 3 points a win, 1 a draw; goal difference; goals scored; in some, head-to-head or criteria applied only at the end or only for a title or relegation place; MLS disciplinary points                       | goals are each half's score (`HAL2A-S:T45`), so goal difference is `gamesDiff` (`pointsDiff` with a points-based `T45P` code); `resultPoints` with an `isDrawn` rule; `when: { phase }` and `when: { purposes }`; disciplinary points as an `external` value | **Partial**: a level result (a draw) in a timed aggregate format is not yet recorded as a drawn result                |
| Football: head-to-head-first tables (La Liga, FIFA, UEFA EURO; partly secondary sources) | the tied teams' games first, re-applied to any residue, then overall                                                                                                                                      | a mini-league with `onSplit: 'CONTINUE'`                                                                                                                                                                                                                     | Supported mechanisms                                                                                                  |
| American football, NFL (NFL tie-breaking procedures)                                     | head-to-head sweep; one team advanced per step; division leaders first; common opponents; strength of victory and schedule; a coin toss                                                                   | `headToHead` mode `SWEEP`, `onSplit: 'EXTRACT_ONE'`, `terminal: 'LOT'`                                                                                                                                                                                       | **Partial**: division pre-reduction, common opponents and strength of victory are not built                           |
| Ice hockey, NHL and IIHF                                                                 | points percentage; regulation wins; 3-2-1-0 points by regulation or overtime result                                                                                                                       | `matchUpsPct`-style percentages; head-to-head among the tied                                                                                                                                                                                                 | **Partial**: distinguishing a regulation win from an overtime win needs a result category the factory does not record |
| Handball (EHF / IHF; secondary sources)                                                  | 2-1-0 points; head-to-head among the tied, restart                                                                                                                                                        | `resultPoints`, the mini-league, `RESTART`                                                                                                                                                                                                                   | Supported mechanisms                                                                                                  |
| Rugby union (Six Nations, Premiership; not verified at source)                           | bonus points for four tries and for losing by seven or fewer                                                                                                                                              | the losing bonus needs the margin and the try bonus needs try counts                                                                                                                                                                                         | **Not yet**                                                                                                           |
| Cricket (ICC, IPL; not verified at source)                                               | net run rate                                                                                                                                                                                              | needs runs and overs per innings                                                                                                                                                                                                                             | **Not yet**                                                                                                           |

### Individual and mind sports

| Competition                                                                               | Rules                                                                                                         | How a policy expresses them                                                                                                                                                                           | Status                                                                                        |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| **Chess, Swiss and round robin** (FIDE Handbook C.07 Tie-Break Regulations, 2024 edition) | direct encounter, re-applied within subsets; Buchholz with Cut-1 and Median; Sonneborn-Berger; number of wins | the head-to-head mini-league; `buchholz`, `buchholzCut1`, `buchholzMedian`, `sonnebornBerger`; `matchUpsWon`. The competition leaderboard maps `BUCHHOLZ` and `SONNEBORN_BERGER` to the same measures | **Partial**: the virtual opponent for unplayed rounds and the progressive score are not built |
| Curling (Olympic round robin)                                                             | wins; head-to-head; the Draw Shot Challenge                                                                   | the head-to-head mini-league; the Draw Shot Challenge as an `external` value (lower is better: `reversed`)                                                                                            | **Supported**                                                                                 |
| Esports group stages                                                                      | head-to-head, then a tiebreaker match where advancement depends on it                                         | the head-to-head mini-league; a tiebreaker match is a played result, and until it is played the organiser's sub-order (`ADJUDICATE`) holds                                                            | **Supported**                                                                                 |

### Not yet supported, and why

Each of these needs an input the factory does not have yet, not a change to how the engine orders:

- **Withdrawn and expunged participants** (USTA's conditional expunge): needs who withdrew.
- **Division or conference pre-reduction** (NFL wild card, NBA division winners): needs a grouping of participants.
- **Common opponents and record against a tier** (NFL, NBA, IIHF): needs the tier or opponent set.
- **Draws in timed aggregate formats** (football, handball, hockey regulation): a level result is not yet recorded as a
  drawn result, so a draw cannot earn its points.
- **Result categories beyond win, draw and loss** (hockey regulation versus overtime, rugby bonus points): needs the
  result to record them.
- **Rates from match statistics** (cricket's net run rate): needs the statistics.
- **Unplayed-round handling in chess** (FIDE's virtual opponent): not built.
