---
title: Hockey examples — sudden death and finite overtime ceilings
sidebar_label: Hockey examples
description: Compare NHL playoff sudden death, four-overtime results, historical ties at a finite ceiling, and modern shootout handoffs.
keywords: [hockey overtime, NHL overtime, sudden death, overtime ceiling, tied result]
---

Hockey distinguishes repeated playoff overtime from a finite regular-season overtime period. Historical
regular-season ties also show that reaching an overtime ceiling need not produce a winner.

:::note Availability
Overtime codes the scoring engine scores are valid for tournament use in Factory releases after 7.29.0 (CA 2026-11-04); a match clock with overtime, and untimed or tiebreak-bearing periods, are not.
:::

## Repeated playoff overtime: sudden death without a ceiling

```text
PER3XA-S:T20P-O:USD/T20P
```

Three twenty-minute regulation periods; if tied, repeat twenty-minute sudden-death periods. The first
goal ends the match immediately. [NHL 2022–23 Rule 84.5](https://media.nhl.com/site/asset/public/ext/2022-23/2022-23Rulebook.pdf)
states the playoff procedure.

The fixtures include **every Florida Panthers overtime playoff game in 2023**, selected from the
[official season schedule](https://api-web.nhle.com/v1/club-schedule-season/FLA/20222023). Scores use away–home
order; the linked game records contain the regulation and overtime goals.

| Game                                                                             | Overtime periods played | Final |
| -------------------------------------------------------------------------------- | ----------------------- | ----- |
| [2023-04-26: FLA–BOS](https://api-web.nhle.com/v1/gamecenter/2022030115/landing) | 1                       | 4–3   |
| [2023-04-30: FLA–BOS](https://api-web.nhle.com/v1/gamecenter/2022030117/landing) | 1                       | 4–3   |
| [2023-05-07: TOR–FLA](https://api-web.nhle.com/v1/gamecenter/2022030213/landing) | 1                       | 2–3   |
| [2023-05-12: FLA–TOR](https://api-web.nhle.com/v1/gamecenter/2022030215/landing) | 1                       | 3–2   |
| [2023-05-18: FLA–CAR](https://api-web.nhle.com/v1/gamecenter/2022030311/landing) | 4                       | 3–2   |
| [2023-05-20: FLA–CAR](https://api-web.nhle.com/v1/gamecenter/2022030312/landing) | 1                       | 2–1   |
| [2023-06-08: VGK–FLA](https://api-web.nhle.com/v1/gamecenter/2022030413/landing) | 1                       | 2–3   |

Florida–Carolina on 18 May reached four overtimes. Its first three were scoreless, and Tkachuk's goal at
19:47 of the fourth ended the match. The overturned goal in the first overtime is not part of the official
scoring sequence. Tests replay approved goals and retain each scoreless overtime period.

## One finite regular-season overtime

```text
PER3XA-S:T20P-O:1SD/T5P
```

[NHL Rule 84.1](https://media.nhl.com/site/asset/public/ext/2022-23/2022-23Rulebook.pdf) specifies a regular-season
sudden-death period of at most five minutes. These first three overtime games in Florida's 2022–23 schedule
were decided during that period:

| Game                                                                             | Overtime periods played | Final |
| -------------------------------------------------------------------------------- | ----------------------- | ----- |
| [2022-10-21: TBL–FLA](https://api-web.nhle.com/v1/gamecenter/2022020071/landing) | 1                       | 3–2   |
| [2022-11-26: STL–FLA](https://api-web.nhle.com/v1/gamecenter/2022020334/landing) | 1                       | 5–4   |
| [2022-11-28: FLA–EDM](https://api-web.nhle.com/v1/gamecenter/2022020351/landing) | 1                       | 3–4   |

## Historical NHL ties at the overtime ceiling

The same finite-period syntax describes the scoring portion of the earlier rule that allowed a tie if
nobody scored in overtime. These are the first two ties in Florida's
[1996–97 schedule](https://api-web.nhle.com/v1/club-schedule-season/FLA/19961997):

| Game                                                                             | Overtime periods played | Final |
| -------------------------------------------------------------------------------- | ----------------------- | ----- |
| [1996-10-08: NYR–FLA](https://api-web.nhle.com/v1/gamecenter/1996020024/landing) | 1                       | 1–1   |
| [1996-10-16: FLA–SJS](https://api-web.nhle.com/v1/gamecenter/1996020067/landing) | 1                       | 3–3   |

These matches finish level after one scoreless overtime, without an extra period or a winner. Replacing
the finite ceiling with U incorrectly leaves them in progress; the tests include that negative control.
The [NHL's historical rule changes](https://records.nhl.com/history/historical-rule-changes) identify the
1983–84 five-minute sudden-death rule and the 2005–06 introduction of shootouts.

## Modern shootout handoffs

If a modern regular-season match is still level after its single overtime, the subsequent shootout needs
its own attempt/decision model. The corpus includes Florida–San Jose on 3 November 2022 and Calgary–Florida
on 19 November 2022 as explicit boundary cases, not simulated one-point deciders.

NHL's shootout-winner goal in the published final is separate from goals actually scored in regulation
and overtime. See [shootout handoffs and tied results](./shootouts-and-ties.md) for both published and played scores.
