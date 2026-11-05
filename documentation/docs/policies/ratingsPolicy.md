---
title: Ratings Policy
---

The **Ratings Policy** (`POLICY_TYPE_RATINGS`) sets how `scaleEngine.generateDynamicRatings` moves a dynamic rating on a result. Every rule it offers encodes a published rating method, and each preset names the method in its `source`.

**Policy Type:** `ratings`

## How a rating moves

Each side moves by `K × (actual − expected)` from the ratings before the result:

- **expected**: the logistic expectation, `1 / (1 + base^((opponent − rating) / spread))`, with base 10 and spread 400 in most published methods;
- **actual**: 1 for a win and 0 for a loss, unless the policy grades the win;
- **K**: one value for both sides (the update is then zero-sum), or each player's own.

## Who is rated, and in what order

- **A run carries ratings forward.** matchUps are rated in order, and each starts from the rating an earlier matchUp in the same run produced, whether or not the run writes them (`updateParticipantRatings`).
- **A pair is rated as its two players.** The side's rating is their average, and each player moves by their own K against it, so under one K both partners move by the same amount (the practice UTR publishes). The pair participant itself is not rated.
- **An individual or a team** is rated as that participant.

## Which policy applies

For each matchUp, the first found:

1. a `ratingsPolicy` passed to `generateDynamicRatings`;
2. a ratings policy attached to the matchUp's event, then to the tournament;
3. the `ratingsPolicy` of the matchUp's `competitionFormat` (its structure's, then its drawDefinition's, then its event's): a preset by name, such as `'POLICY_RATINGS_ELO_538_NHL'`, or a policy inline;
4. `POLICY_RATINGS_DEFAULT`.

A preset name the factory does not know, or an inline policy without `expectation`, `k` and `actual`, refuses the run with `INVALID_VALUES` before anything is written.

```js
tournamentEngine.modifyEvent({
  eventId,
  eventUpdates: { competitionFormat: { sport: 'OTHER', ratingsPolicy: 'POLICY_RATINGS_ELO_538_NHL' } },
});
```

## Rules

| Part             | Rule                                                                           | Method                                                                                                                                                                                     |
| ---------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `expectation`    | `{ rule: 'LOGISTIC', base, spread }`                                           |                                                                                                                                                                                            |
| `k`              | `{ rule: 'CONSTANT', value }`                                                  | one K for both players                                                                                                                                                                     |
| `k`              | `{ rule: 'MATCHES_PLAYED', numerator, offset, shape }`                         | FiveThirtyEight's tennis K, `250 / (m + 5)^0.4`, m the player's career matches played                                                                                                      |
| `actual`         | `{ rule: 'WIN_LOSS' }`                                                         | 1 / 0                                                                                                                                                                                      |
| `actual`         | `{ rule: 'SETS_PLAYED_SHARE' }`                                                | Huang 2014: a best-of-3 win in 2 sets is 1 and in 3 is 2/3; a best-of-5 win in 3, 4 and 5 sets is 1, 0.8 and 0.6; the loser takes the complement. Any other format is rated as a plain win |
| `walkovers`      | `'RATE_AS_WIN'` (default) or `'EXCLUDE'`                                       | Huang 2014 rates a walkover as a straight-sets win                                                                                                                                         |
| `draws`          | `'RATE_AS_HALF'` (default) or `'EXCLUDE'`                                      | a COMPLETED result with no winner: 0.5 each, as every published Elo-family method scores it                                                                                                |
| `kByTier`        | `{ 'system:value': K }`                                                        | K by the event's tier, then the tournament's (`TierClassification`); otherwise `k`                                                                                                         |
| `margin`         | `{ rule: 'GOAL_DIFFERENCE_STEPS' }`                                            | World Football Elo: K × 1 for a draw or a one-goal win, × 1.5 for two, × 1.75 for three, × (11 + N) / 8 for N ≥ 4                                                                          |
| `margin`         | `{ rule: 'LOG_MOV_AUTOCORRECTED', scale, offset, intercept, autocorrelation }` | FiveThirtyEight's NHL and NFL Elo: K × (scale · ln(margin + offset) + intercept) × autocorrelation / (winnerEloDiff × 0.001 + autocorrelation)                                             |
| `margin`         | `{ rule: 'WINNER_GAME_SHARE' }`                                                | Weighted Elo (Angelini et al. 2022): both updates × the winner's share of the games                                                                                                        |
| `overtimeResult` | `{ rule: 'FULL_RESULT', margin? }`                                             | a win in overtime, rated as a full win (FiveThirtyEight NHL: by one goal)                                                                                                                  |
| `shootoutResult` | `{ rule: 'FULL_RESULT', margin? }` or `{ rule: 'PARTIAL', winner, loser }`     | a win in a shootout: a full win (FiveThirtyEight NHL), or FIFA's 0.75 and 0.5                                                                                                              |
| `protections`    | `['KNOCKOUT_LOSS_PROTECTION']`                                                 | FIFA: in the knock-out rounds of a final competition a side that falls short of its expectation keeps its rating; read as a MAIN-stage elimination structure                               |

**What the margin reads.** In an aggregate format (goals or points summed across its periods), the margin is the difference between the totals, without a decider's point or a shootout's goals. A rule that rates an overtime or shootout win by a set margin uses that margin instead. Other formats have no margin, and a margin rule leaves K as it is.

**How an overtime or shootout result is known.** From the score's overtime record: `decidedIn: 'OVERTIME'`, or a shootout decider (`-F:SO`), or a result decided outside the score by `SHOOTOUT`. Without a rule for it, the result is the recorded win.

The factory holds no player's career history, so a `MATCHES_PLAYED` K reads the counts the caller passes as `matchesPlayed` (`{ [participantId]: count }`, matches played before the run; each rated matchUp adds one). Without a count for a player, the run is refused with `MISSING_VALUE` before anything is written.

## Presets

| Preset                              | Method                                                                                                                                                                                                              |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POLICY_RATINGS_DEFAULT`            | J. Huang, "Elo Ratings and the ATP", Berkeley STAT 157, 2014: K = 25 for both players (the paper's flat-K run; its K by event level needs a level to read), actual result by sets played, a walkover rated as a win |
| `POLICY_RATINGS_ELO_538_TENNIS`     | FiveThirtyEight's tennis Elo as S. Kovalchik describes it ("Searching for the GOAT of tennis win prediction", 2016): K by career matches played, plain win or loss; needs `matchesPlayed`                           |
| `POLICY_RATINGS_ELO_WELO_TENNIS`    | Angelini, Candila & De Angelis, "Weighted Elo rating for tennis match predictions", 2022: FiveThirtyEight's K, both updates × the winner's game share; needs `matchesPlayed`                                        |
| `POLICY_RATINGS_ELO_WORLD_FOOTBALL` | World Football Elo Ratings (eloratings.net): K 30 (set the 60 / 50 / 40 / 20 match types in `kByTier`), goal-difference steps, a draw 0.5. Not encoded: the +100 home advantage. No shootout rule is published      |
| `POLICY_RATINGS_FIFA_SUM`           | FIFA, "Revision of the FIFA / Coca-Cola World Ranking", 2018: spread 600, I in `kByTier` (base 10, a friendly inside the international windows), shootout 0.75 / 0.5, knock-out loss protection, no goal margin     |
| `POLICY_RATINGS_ELO_538_NHL`        | FiveThirtyEight, "How Our NHL Predictions Work", 2021: K 6, log margin with its autocorrelation term, an overtime or shootout win a full win by one goal. Not encoded: home ice, playoff scaling, season reversion  |

A matchUp has no home or away side, so no preset encodes home advantage.

```js
import { fixtures, scaleEngine, tournamentEngine } from 'tods-competition-factory';

tournamentEngine.attachPolicies({ policyDefinitions: fixtures.policies.POLICY_RATINGS_ELO_538_TENNIS });
scaleEngine.generateDynamicRatings({ matchUpIds, matchesPlayed: { [participantId]: 42 } });
```
