---
title: Round Robin Tally Policy
---

A **Tally Policy** controls how order is determined for Round Robin groups.

See [engine.attachPolicies](/docs/governors/policy-governor#attachpolicies).

```js
const roundRobinTally = {
  groupOrderKey: 'matchUpsWon', // possible to group by tieMatchUpsWon, tieSinglesWon, tieDoublesWon, matchUpsWon, pointsWon, gamesWon, setsWon, gamesPct, setsPct, pointsPct, matchUpsPct
  groupTotalGamesPlayed: false, // optional - when true will calculate % of games won based on total group games played rather than participant games played
  groupTotalSetsPlayed: false, // optional - when true will calculate % of sets won based on total group sets played rather than participant sets played
  headToHead: { disabled: false },
  tallyDirectives: [
    // these are the default values if no tallyDirectives provided; edit to suit
    // groupTotals scopes the tally calculations to all sets or games or matches played by all participants
    // idsFilter scopes the tally calculations to only tied participants
    // with { idsFilter: false } the ratio is calculated from all group matchUps
    // with { idsFilter: true } the ratio is calculated from matchUps including tied participants
    // when { maxParticipants: 2 } is defined, the rule only applies when # of participants is <= maxParticipants
    // any attribute/idsFilter combination can be selectively disabled for Head to Head calculations
    { attribute: 'matchUpsPct', idsFilter: false, disbleHeadToHead: false },
    { attribute: 'allDefaults', reversed: true, idsFilter: false }, // reversed: true => reverses default which is greatest to least
    {
      attribute: 'tieMatchUpsPct',
      idsFilter: false,
      disbleHeadToHead: false,
    },
    { attribute: 'setsPct', idsFilter: false, disbleHeadToHead: false },
    { attribute: 'gamesPct', idsFilter: false, disbleHeadToHead: false },
    { attribute: 'pointsPct', idsFilter: false, disbleHeadToHead: false },
    { attribute: 'matchUpsPct', idsFilter: true, disbleHeadToHead: false },
    { attribute: 'tieMatchUpsPct', idsFilter: true, disbleHeadToHead: false },
    { attribute: 'setsPct', idsFilter: true, disbleHeadToHead: false },
    { attribute: 'gamesPct', idsFilter: true, disbleHeadToHead: false },
    { attribute: 'pointsPct', idsFilter: true, disbleHeadToHead: false },
  ],
  excludeMatchUpStatuses: [], // matchUpStatuses to exclude from calculations, e.g. ABANDONED, INCOMPLETE
  setsCreditForDefaults: false, // whether or not to award e.g. 2 sets won for participant who wins by opponent DEFAULT
  setsCreditForWalkovers: false, // whether or not to award e.g. 2 sets won for participant who wins by opponent WALKOVER
  setsCreditForRetirements: false, // whether or not to award e.g. 2 sets won for participant who wins by opponent RETIREMENT
  gamesCreditForDefaults: false, // whether or not to award e.g. 12 games won for participant who wins by opponent DEFAULT
  gamesCreditForWalkovers: false, // whether or not to award e.g. 12 games won for participant who wins by opponent WALKOVER
  gamesCreditForRetirements: false, // whether or not to award e.g. 2 sets won for participant who wins by opponent RETIREMENT
  gamesCreditForTiebreakSets: true, // defaults to true; whether to count a tiebreak set as a game won, e.g. 6-2 2-6 [10-3]
  GEMscore: ['matchUpsPct', 'tieMatchUpsPct', 'setsPct', 'gamesPct', 'pointsPct'],
  precision: 3, // controls % rounding in tally results, e.g. precision of 3 returns .667 whereas precision 5 returns .66667
};

engine.attachPolicies({ policyDefinitions: { roundRobinTally } });
```

## Default Behavior

Round Robin group tally logic by default implements the following guidelines:

1. The participant who wins the most matches is the winner.
2. If two players are tied, then the winner of their head-to-head match is the winner.

If three or more participants are tied, tie are broken as follows:

- The head-to-head win-loss record in matches involving just the tied players;
- The participant with the highest percentage of sets won of all sets completed;
- The head-to-head win-loss record in matches involving the players who remain tied;
- The participant with the highest percentage of games won of all games completed;
- The head-to-head win-loss record in matches involving the players who remain tied;
- The participant with the highest percentage of sets won of sets completed among players in the group under consideration;
- The head-to-head win-loss record in matches involving the players who remain tied;
- The participant with the highest percentage of games won of games completed among the players under consideration; and
- The head-to-head win-loss record in matches involving the players who remain tied.

## Implementation Details

After initial separation of participants by `matchUpsWon`,
the implementation is configurable by supplying an array of `tallyDirectives` in the **Tally Policy**.

The algorithm relies on the values availble in the calculated `participantResults` and works as follows:

- separate participants into groups by a given attribute
- a group with a single participant is 'resolved'
- groups of two participants are resolved by head-to-head (if not disabled/if participants faced each other)
- groups of three or more search for an attribute that will separate them into smaller groups
- participantResults scoped to the members of a group and recalculated when `{ idsFilter: true }`

## Drawn Matches and Standings Points

A legitimate completed tie counts as `matchUpsDrawn` for both competitors, with neither
a win nor a loss. It is distinct from `matchUpsCancelled`. Currently this applies to
a completed equal score under an even combined-rally total such as `SET1-S:P32`;
16–16 completes that format, while the same score does not complete `P32DP` or `P32WB2`.
Incomplete scores and unsupported winnerless records are not inferred to be draws.

`drawCredit` controls the fraction of a win credited in `matchUpsPct`, defaults to **0.5**,
and must be between zero and one:

```text
matchUpsPct = (matchUpsWon + drawCredit × matchUpsDrawn)
              / (matchUpsWon + matchUpsLost + matchUpsDrawn)
```

One win and one draw therefore yield 0.75 with the default credit. A cancellation
does not enter this denominator. Existing precision rounding still applies. The
legacy `result` string retains its wins/losses notation; use `matchUpsDrawn` separately.

An optional `outcomePoints` table adds `standingsPoints`, separate from scored rally
points (`pointsWon`/`pointsLost`). All three entries must be finite numbers; zero,
fractional and negative credits are supported. Points follow counted wins, draws
and losses, including wins/losses by walkover, default or retirement; existing
status exclusion and disqualification policies still apply. No standings-points
field is produced without the table.

```js
const roundRobinTally = {
  groupOrderKey: 'standingsPoints',
  drawCredit: 0.5,
  outcomePoints: { win: 3, draw: 1, loss: 0 },
  tallyDirectives: [
    { attribute: 'pointsWon', idsFilter: false },
    { attribute: 'pointsPct', idsFilter: true },
  ],
};
engine.attachPolicies({ policyDefinitions: { roundRobinTally } });
```

This table gives one win and one draw four standings points. Set `groupOrderKey`
to `standingsPoints` to rank by that table, `matchUpsPct` for weighted win percentage,
or `pointsWon` for actual points scored. The default remains `matchUpsWon`.
`standingsPoints` is also usable in tally directives, including the existing
`idsFilter` restriction to matches among tied competitors. Ranking by standings
points requires an `outcomePoints` table; invalid credit/table settings return
`INVALID_VALUES` from tally queries.

Scores from a tied combined-point match contribute rally points to each side but
do not become games or won sets. A drawn head-to-head establishes no winner;
configured directives resolve the ranking, or competitors retain shared ranks.
Corrections, score clears and policy changes recompute the tally from current
results. This policy does not change scoring completion or permit ties in
winner-advancing elimination structures.
