---
title: Basketball examples — repeated overtime
sidebar_label: Basketball examples
description: Work through official NBA double- and quadruple-overtime results using repeated five-minute overtime periods and aggregate scoring.
keywords: [basketball overtime, NBA overtime, repeated overtime, double overtime, quadruple overtime]
---

NBA overtime provides clear examples of **repeated overtime without a numerical ceiling**. A lead during
an overtime period is not enough: play continues until the period ends.

:::note Availability
Overtime codes the scoring engine scores are valid for tournament use in Factory releases after 7.29.0 (CA 2026-11-04); a match clock with overtime, and untimed or tiebreak-bearing periods, are not.
:::

```text
QTR4XA-S:T12P-O:U/T5P
```

Four twelve-minute regulation quarters; if the total is tied, repeat five-minute overtime periods until
one ends with unequal totals. See [NBA Rule 5, sections II and IV](https://official.nba.com/rule-no-5-scoring-and-timing/).

## Double and quadruple overtime results

Scores use the named team order, away then home. Overtime entries are **period scores**, not running totals.
The linked NBA pages publish every period score and the final result.

| Game                                                                                       | Regulation total | Overtime period scores | Final   |
| ------------------------------------------------------------------------------------------ | ---------------- | ---------------------- | ------- |
| [New York–Atlanta, 29 January 2017](https://www.nba.com/game/nyk-vs-atl-0021600711)        | 104–104          | 9–9, 10–10, 7–7, 9–12  | 139–142 |
| [Denver–Portland, 3 May 2019](https://www.nba.com/game/den-vs-por-0041800233)              | 102–102          | 7–7, 9–9, 11–11, 8–11  | 137–140 |
| [Sacramento–LA Clippers, 24 February 2023](https://www.nba.com/game/sac-vs-lac-0022200902) | 153–153          | 11–11, 12–11           | 176–175 |

## Why U matters

New York–Atlanta remained tied after its first, second and third overtimes. A hidden one-, two-, or
three-period ceiling would stop before the published result. U allows the fourth period to be played.

X would be different: `O:4X/T5P` would require all four extra periods even if the first ended unequal.
SD would also be different: the first overtime score would end the match. Neither describes these games.

## What the result tests check

Offline fixtures retain every regulation and overtime period, not just the final score. Tests reproduce
each result from period-total input and verify that every earlier period leaves the match in progress.
Point-input parity uses a synthetic order consistent with each published period total; it does not claim
to reproduce historical possession-by-possession play.

Read [repeated overtime and ceilings](./periods-and-limits.md), or compare [hockey sudden death](./hockey-examples.md).
