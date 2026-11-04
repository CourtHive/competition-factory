---
title: Football examples — exact extra-time halves, golden goals and silver goals
sidebar_label: Football examples
description: Compare mandatory extra-time halves, historical golden and silver goals, and penalty-shootout handoffs using official football results.
keywords: [football extra time, exact extra-time halves, golden goal, silver goal, penalty shootout]
---

Football's historical rules show why “play extra time” needs a precise completion rule. An extra-time
goal has sometimes ended the match immediately, sometimes decided it at a period boundary, and sometimes
left a mandatory second half still to play.

:::note Availability
Overtime codes the scoring engine scores are valid for tournament use in Factory releases after 7.29.0 (CA 2026-11-04); a match clock with overtime, and untimed or tiebreak-bearing periods, are not.
:::

## Exact extra-time halves: Belgium–USA 2014 {#belgium-usa-2014}

```text
HAL2XA-S:T45P-O:2X/T15P
```

At the 2014 World Cup, regulation ended 0–0. Belgium scored at 93 and 105 minutes in the first extra
half; the USA scored at 107 in the second. Both extra halves had to be played. The result was **2–1**.
[RBFA's official match record](https://static.rbfa.be/project/publiek/rencinter/en/wed_8203.htm)
publishes the regulation score, scoring times and result.

Removing X changes the behavior: a two-period ceiling compares totals after the first extra half,
stopping at 2–0 and losing the later USA goal. The real-result tests include that incorrect interpretation
as a negative control.

The same exact-block format covers [Portugal–France in the EURO 2016 final](https://www.uefa.com/uefaeuro/history/news/0253-0d81c3763c88-e741506b5589-1000/):
0–0 in regulation, 0–0 in the first extra half, then Éder's 109th-minute goal in the second. The final
score was 1–0. A goal during that second half does not itself replace the period-end decision.

## Golden goal: France–Italy 2000

```text
HAL2XA-S:T45P-O:2SD/T15P
```

France and Italy were level 1–1 after regulation. Trezeguet's golden goal in the first extra half
completed the match immediately, 2–1; no second extra half followed.
[UEFA's account](https://www.uefa.com/uefaeuro/history/news/0253-0d7b3013529f-3e15ce8dc46b-1000--trezeguet-s-golden-goal-sinks-italy-as-france-make-histor/)
identifies the golden-goal finish, and [FFF records the goal at 103 minutes](https://www.fff.fr/article/2830-le-parcours-des-bleus-a-l-euro-2000.html).

The ceiling is two periods, but SD can finish play during either. This is not `2X`.

## Silver goal: Greece–Czech Republic 2004

```text
HAL2XA-S:T45P-O:2/T15P
```

Regulation was scoreless. Dellas scored in added time at the end of the first extra half, which ended
with Greece ahead 1–0. The silver-goal rule made that **period boundary** decisive.
[UEFA's report](https://www.uefa.com/uefaeuro/history/news/0253-0d7b43e4d6d3-1e43d840c0a8-1000--dellas-delight-stuns-czech-republic/)
and [match timeline](https://www.uefa.com/uefaeuro/match/79108--greece-vs-czech-republic/)
place the goal in the first extra half.

Unlike a golden goal, the scoring event does not itself finish the period. Unlike X, a first-period
lead does not require a second extra half. See [golden goals versus silver goals](./golden-and-silver-goals.md).

## Still level after exact extra time: France–Switzerland 2021

France and Switzerland were 3–3 after regulation and remained level through both extra halves.
Switzerland then won penalties 5–4. The [FFF match record](https://www.fff.fr/selection/matchs/2934-france-suisse.html)
keeps the 3–3 match score and 4–5 penalty tally separate in France-first order.

The overtime fixture verifies play through the extra-time ceiling only. It does not recast penalties
as `F:TB1` or claim that an overtime score alone determines the eventual winner. See
[shootout handoffs and tied results](./shootouts-and-ties.md).

Golden and silver goals above are historical examples, not today's default. Current permitted extra-time
and penalty procedures are described by [IFAB Law 10](https://www.theifab.com/laws/latest/determining-the-outcome-of-a-match/).
