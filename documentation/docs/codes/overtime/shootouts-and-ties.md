---
title: Shootout handoffs and tied results
sidebar_label: Shootout handoffs and tied results
description: Explain finite overtime ending level, conditional final deciders, and why a shootout score must remain separate from the sporting aggregate.
keywords: [shootout handoff, penalty shootout, tied result, overtime ceiling, final decider]
---

A format must distinguish **finishing level**, **playing a final decider**, and **handing off to a shootout**.
Those outcomes should not be hidden inside an ambiguous overtime count.

:::note Availability
The overtime extension is in development and is not yet enabled in published Factory versions. A full
shootout attempt model is a separate part of the scoring design.
:::

## Finishing level at a finite ceiling

```text
PER3XA-S:T20P-O:1SD/T5P
```

If the single overtime finishes scoreless, the covered match finishes level without a winner. That was
a real NHL regular-season outcome before shootouts were introduced. The [historical hockey examples](./hockey-examples.md#historical-nhl-ties-at-the-overtime-ceiling)
include 1–1 and 3–3 final results.

Exactly-N regulation can also finish level without any overtime. For example, `SET2X-S:6/TB7` means play
exactly two sets; 1–1 is a valid finish. Plain `SET2` means “best of two” and is not an alternative way to
request exact play or overtime.

## A final decider is separate from the aggregate

```text
PER3XA-S:T20P-O:3/T5P-F:TB1
```

F offers a final one-point decider if the aggregate is still tied at the overtime ceiling. The decider
settles the winner; its score is not added into the regulation-plus-overtime aggregate.

Without O, an existing XA format's F is the decider immediately after regulation. With O, F follows the
finite overtime ceiling. An unlimited overtime sequence cannot also have a reachable F fallback.

## Shootout handoffs are not `F:TB1`

A shootout can require alternating attempts, equal opportunities, early mathematical elimination, and
further attempts when still level. A one-point tiebreak does not describe those rules.

The sourced tests therefore stop at the overtime boundary for three shootout games. They retain the
actual eventual winner as a separate fact; they do not assert that the present overtime reducer can
produce that winner through a fabricated one-point fallback.

| Example                           | Sporting score through overtime | Separate deciding outcome                                |
| --------------------------------- | ------------------------------- | -------------------------------------------------------- |
| Florida–San Jose, 3 November 2022 | 3–3                             | NHL official final is 4–3 after its shootout-winner goal |
| Calgary–Florida, 19 November 2022 | 4–4                             | NHL official final is 5–4 after its shootout-winner goal |
| France–Switzerland, 28 June 2021  | 3–3                             | Switzerland win penalties 5–4                            |

Sources: [NHL Florida–San Jose](https://api-web.nhle.com/v1/gamecenter/2022020173/landing),
[NHL Calgary–Florida](https://api-web.nhle.com/v1/gamecenter/2022020275/landing),
[FFF France–Switzerland](https://www.fff.fr/selection/matchs/2934-france-suisse.html).

## A shootout decider: `F:SO{rounds}`

```text
HAL2XA-S:T45P-O:2X/T15P-F:SO5
```

`SO5` is a shootout of five rounds, the final segment after a level overtime. It needs `-O:`: a match that goes
straight to penalties (`SET2XA-S:T45P-F:SO5`) is not a code; its shootout is recorded on the result
(`score.overtime.decidedIn: 'EXTERNAL'`, `decidedBy: { method: 'SHOOTOUT', tally }`). It is entered as its final
tally, never attempt by attempt: France–Switzerland above is `3–3` through extra time and `4–5` in the shootout. A
tally is refused when no shootout ends on it: level, past the five rounds by more than one (sudden death is won by
one), or more than the shootout could reach before one side could no longer catch up (`4–0` in five rounds; it ends
at `3–0`). Attempt-by-attempt entry is a later slice that reduces to the same tally.

An NHL shootout-winner goal in the published final is not a goal scored during overtime. Football's
penalty tally is also separate from the goals scored during the match. Preserving that distinction is
essential for standings, statistics, and explaining how a match was decided.

See [period limits](./periods-and-limits.md), [hockey examples](./hockey-examples.md), or [football examples](./football-examples.md).
