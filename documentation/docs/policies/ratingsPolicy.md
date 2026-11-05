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

## Which policy applies

For each matchUp, the first found:

1. a `ratingsPolicy` passed to `generateDynamicRatings`;
2. a ratings policy attached to the matchUp's event, then to the tournament;
3. `POLICY_RATINGS_DEFAULT`.

## Rules

| Part          | Rule                                                   | Method                                                                                                                                                                                     |
| ------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `expectation` | `{ rule: 'LOGISTIC', base, spread }`                   |                                                                                                                                                                                            |
| `k`           | `{ rule: 'CONSTANT', value }`                          | one K for both players                                                                                                                                                                     |
| `k`           | `{ rule: 'MATCHES_PLAYED', numerator, offset, shape }` | FiveThirtyEight's tennis K, `250 / (m + 5)^0.4`, m the player's career matches played                                                                                                      |
| `actual`      | `{ rule: 'WIN_LOSS' }`                                 | 1 / 0                                                                                                                                                                                      |
| `actual`      | `{ rule: 'SETS_PLAYED_SHARE' }`                        | Huang 2014: a best-of-3 win in 2 sets is 1 and in 3 is 2/3; a best-of-5 win in 3, 4 and 5 sets is 1, 0.8 and 0.6; the loser takes the complement. Any other format is rated as a plain win |
| `walkovers`   | `'RATE_AS_WIN'` (default) or `'EXCLUDE'`               | Huang 2014 rates a walkover as a straight-sets win                                                                                                                                         |

The factory holds no player's career history, so a `MATCHES_PLAYED` K reads the counts the caller passes as `matchesPlayed` (`{ [participantId]: count }`, matches played before the run; each rated matchUp adds one). Without a count for a player, the run is refused with `MISSING_VALUE` before anything is written.

## Presets

| Preset                          | Method                                                                                                                                                                                                              |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POLICY_RATINGS_DEFAULT`        | J. Huang, "Elo Ratings and the ATP", Berkeley STAT 157, 2014: K = 25 for both players (the paper's flat-K run; its K by event level needs a level to read), actual result by sets played, a walkover rated as a win |
| `POLICY_RATINGS_ELO_538_TENNIS` | FiveThirtyEight's tennis Elo as S. Kovalchik describes it ("Searching for the GOAT of tennis win prediction", 2016): K by career matches played, plain win or loss; needs `matchesPlayed`                           |

```js
import { fixtures, scaleEngine, tournamentEngine } from 'tods-competition-factory';

tournamentEngine.attachPolicies({ policyDefinitions: fixtures.policies.POLICY_RATINGS_ELO_538_TENNIS });
scaleEngine.generateDynamicRatings({ matchUpIds, matchesPlayed: { [participantId]: 42 } });
```
