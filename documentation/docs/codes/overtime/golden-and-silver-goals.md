---
title: Sudden death, golden goals and silver goals
sidebar_label: Sudden death, golden and silver goals
description: Compare immediate sudden-death and golden-goal finishes with silver-goal period boundaries and mandatory exact extra-time halves.
keywords: [sudden death, golden goal, silver goal, extra time]
---

“Extra time” does not identify a single completion rule. A goal can end a match immediately, decide it at
the period boundary, or leave a mandatory second half still to play.

:::note Availability
The overtime extension is in development and is not yet enabled in published Factory versions.
:::

## Sudden death ends at the scoring event

```text
PER3XA-S:T20P-O:USD/T20P
```

If regulation is tied, repeat twenty-minute sudden-death periods until a goal breaks the tie. SD applies
to overtime only: a regulation lead does not end the match prematurely.

The Florida–Carolina playoff game on 18 May 2023 reached its fourth overtime. Tkachuk's goal at **19:47**
ended play immediately, rather than waiting for the final thirteen seconds. The [official NHL recap](https://www.nhl.com/panthers/news/recap-panthers-outlast-hurricanes-win-4ot-thriller-in-game-1-344464818)
and [hockey examples](./hockey-examples.md) supply the context.

A zero-valued scoring event does not break the tie. A sudden-death period with no score can end at time
and repeat, subject to the declared ceiling.

## Golden goals are sudden death

```text
HAL2XA-S:T45P-O:2SD/T15P
```

This historical football rule offers up to two extra halves, with a goal ending the match immediately.
In the EURO 2000 final, France and Italy were level after regulation; Trezeguet's golden goal in the
first extra half ended the match 2–1. There was no mandatory second extra half.
[UEFA's match account](https://www.uefa.com/uefaeuro/history/news/0253-0d7b3013529f-3e15ce8dc46b-1000--trezeguet-s-golden-goal-sinks-italy-as-france-make-histor/)
identifies the historical golden-goal finish.

## Silver goals wait for the period end

```text
HAL2XA-S:T45P-O:2/T15P
```

There is no SD and no X. A lead becomes decisive at the end of an extra period. If the first finishes
level, continue into the second.

Greece–Czech Republic at EURO 2004 ended after the first extra half, following Dellas's silver goal.
The goal itself and the period-end decision remain different scoring boundaries, even though the goal
was scored in added time at the end of that half.
[UEFA's report](https://www.uefa.com/uefaeuro/history/news/0253-0d7b43e4d6d3-1e43d840c0a8-1000--dellas-delight-stuns-czech-republic/)
states that distinction.

## An exact block still requires both halves

```text
HAL2XA-S:T45P-O:2X/T15P
```

X gives a third behavior: play both extra halves before deciding the aggregate. A first-half lead is
neither a golden-goal finish nor a silver-goal finish. See [exact extra-time halves](./periods-and-limits.md#exact-extra-time-halves)
and the [football results](./football-examples.md).

Golden and silver goals here describe historical competition rules. They are not offered as today's
default football rules; modern extra-time procedures are described in [IFAB Law 10](https://www.theifab.com/laws/latest/determining-the-outcome-of-a-match/).
