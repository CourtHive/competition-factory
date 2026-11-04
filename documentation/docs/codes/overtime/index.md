---
title: Overtime and extra-time formats
sidebar_label: Overview and syntax
slug: /codes/overtime
description: Specify repeated overtime, finite ceilings, exact extra-time halves, sudden death and shootout handoffs with matchUpFormat codes.
keywords: [matchUpFormat, overtime, extra time, overtime periods]
---

Overtime is additional play offered when regulation finishes with aggregate scores level. A matchUpFormat
code should say how long each extra period lasts, whether to repeat, when to compare totals, and what
happens if the scores are still level at the limit.

:::note Availability
The overtime extension is in development and is not yet enabled in published Factory versions.
:::

## The overtime section: `-O:`

```text
{ROOT}{count}[X][A]-S:{segment}[-G:{game}][-O:{limit}[X][SD]/{segment}][-F:{segment}][-M:{constraint}]
```

The new section is **O for overtime**. It follows G, if present, and precedes F and M. The O in `-O:` is
distinct from an outs-based segment such as `-S:O3`.

| Part       | Meaning                                                                | Example                                |
| ---------- | ---------------------------------------------------------------------- | -------------------------------------- |
| `limit`    | Maximum additional periods, excluding regulation and the final decider | `O:3/T5P`                              |
| `U`        | Repeat without a numerical ceiling while tied                          | `O:U/T5P`                              |
| `X`        | Play exactly this many overtime periods before comparing totals        | `O:2X/T15P`                            |
| `SD`       | Sudden death: end immediately when a scoring event breaks the tie      | `O:1SD/T5P`                            |
| `/segment` | Reuse an existing segment specification                                | `T5P` = five minutes, scored in points |

O requires aggregate scoring, declared with **A**. Regulation and overtime points accumulate into the same
sporting total. Winning more individual periods does not decide an aggregate match.

## Regulation → overtime → final decider

Play every regulation segment. An unequal aggregate ends the match. A level aggregate enters overtime.
Ordinary overtime is compared at period ends; exact blocks wait until the whole block ends; sudden death
can end during a period.

At a finite ceiling, an unequal aggregate decides the match. If still level, enter a declared F fallback,
or finish level when there is none. The fallback's deciding score is separate from the sporting aggregate.
Unlimited overtime has no reachable F fallback.

## Choose the behavior you mean

- [Repeated overtime, exact extra-time halves and finite ceilings](./periods-and-limits.md): U versus a cap versus X.
- [Sudden death, golden goals and silver goals](./golden-and-silver-goals.md): a scoring event versus a period boundary.
- [Shootout handoffs and tied results](./shootouts-and-ties.md): finishing level, final deciders and separate shootout scores.

## Worked sporting examples

The examples use published results rather than scores invented to fit a format:

- [Basketball: repeated overtime](./basketball-examples.md), including two NBA games that required four overtimes.
- [Hockey: sudden death and finite ceilings](./hockey-examples.md), including a four-overtime playoff game and historical draws.
- [Football: exact halves, golden goals and silver goals](./football-examples.md), including an extra-time lead that must not end play early.

Return to [matchUpFormat codes](../matchup-format.mdx) or the [formal grammar specification](../matchup-format-grammar.md).
