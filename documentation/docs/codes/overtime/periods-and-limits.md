---
title: Repeated overtime, exact extra-time halves and finite ceilings
sidebar_label: Repetition, exact blocks and ceilings
description: Distinguish unlimited repeated overtime, finite overtime ceilings ending level, and mandatory exact extra-time halves in matchUpFormat codes.
keywords: [repeated overtime, overtime ceiling, exact extra-time halves, aggregate scoring]
---

The overtime count is independent of the regulation count. Four quarters with up to three overtimes means
four regulation segments and at most three additional periods, not a best-of-seven match.

:::note Availability
The overtime extension is in development and is not yet enabled in published Factory versions.
:::

## Repeated overtime without a ceiling

```text
QTR4XA-S:T12P-O:U/T5P
```

Play four twelve-minute quarters and compare aggregate points. If tied, play a five-minute overtime.
Compare at its end; if still tied, play another. **U is unlimited repetition**, not a large hidden cap.
A lead during a period does not finish ordinary overtime.

The [NBA examples](./basketball-examples.md) include games with two and four overtimes.

## Finite ceilings ending level

```text
PER3XA-S:T20P-O:1SD/T5P
```

Play three twenty-minute regulation periods. If tied, offer one five-minute sudden-death period. A goal
ends it immediately; no goal by the ceiling finishes the covered play level. Historical NHL regular-season
ties provide [real examples](./hockey-examples.md#historical-nhl-ties-at-the-overtime-ceiling).

Without SD, the ceiling still applies, but a lead is assessed at the period end:

```text
HAL2XA-S:T45P-O:2/T15P
```

There are at most two additional fifteen-minute periods. If one side leads after the first, finish there.
This expresses the period-boundary behavior of a historical [silver goal](./golden-and-silver-goals.md#silver-goals-wait-for-the-period-end).

## Exact extra-time halves

```text
HAL2XA-S:T45P-O:2X/T15P
```

If regulation is tied, play **both** extra-time halves. Compare the accumulated score only when both
are complete. A lead after the first half does not waive the second.

In Belgium–USA at the 2014 World Cup, regulation was 0–0. Belgium scored twice in the first extra half;
the USA scored in the second. The result is **2–1**, not an early 2–0 finish. See the
[football examples](./football-examples.md#belgium-usa-2014).

X means exactly the stated number of periods in one block. It does not mean repeated mandatory pairs.
A grammar for repeating whole blocks is a separate extension.

## A final fallback after the ceiling

```text
PER3XA-S:T20P-O:3/T5P-F:TB1
```

If still tied after three overtimes, play a one-point final decider. Its segment number is
`3 regulation + 3 overtime + 1 = 7`. It is not segment 4 simply because regulation contained three periods.
If overtime produces a winner earlier, the fallback is not played.

This is a format illustration, not a claim that an NHL shootout is a one-point tiebreak. See
[shootout handoffs](./shootouts-and-ties.md).

## Combinations that do not make sense

| Combination | Problem                                                                    |
| ----------- | -------------------------------------------------------------------------- |
| `UX`        | Unlimited repetition cannot also be an exact finite block                  |
| `XSD`       | Mandatory completion of every period conflicts with immediate sudden death |
| U with F    | An unlimited while-tied sequence never reaches a finite fallback           |
| O without A | This overtime extension resolves aggregate totals                          |

The relationship between a match-wide M clock and overtime is not yet defined. Do not infer that a match
clock includes or excludes extra time. Likewise, the first implementation supports timed regulation and
overtime without segment-local tiebreaks; readable segment syntax is not a promise of every scoring combination.

See [overtime syntax](./index.md), [golden and silver goals](./golden-and-silver-goals.md), or [tied results](./shootouts-and-ties.md).
