---
title: Randomness and Reproducible Draws
sidebar_label: Randomness
---

## Overview

Many steps that build a draw are random: placing BYEs and qualifiers, drawing unseeded positions, advancing lucky
losers, resolving a draft, pairing drawMatic and rotating-partner rounds, and minting ids. The factory reads all of
them through one source of randomness that it controls, so a draw can be made reproducible, replayed, or audited
without patching `Math.random`.

This page ties together the pieces documented in the reference pages:
[`engine.setRandomSource`](../engines/engine-methods.md#setrandomsource), and
[`createSeededRandom`, `randomSource` and `setRandomSource`](../tools/tools-api.md#createseededrandom) in the tools API.

## Where randomness comes from

Every random step asks for a random function, and takes the first of these that exists:

| Precedence | Source                           | Set by                                                                        | Scope             |
| ---------- | -------------------------------- | ----------------------------------------------------------------------------- | ----------------- |
| 1          | the call's own `random` function | a method's `random` parameter, or `nonRandom: <seed>` on the call (see below) | that call only    |
| 2          | the configured source            | `engine.setRandomSource(seed \| fn)` or `tools.setRandomSource(seed \| fn)`   | the whole process |
| 3          | `Math.random`                    | default                                                                       | the whole process |

The source is read at the moment of each draw, never captured when a module loads, so configuring or resetting it
takes effect on the next call.

### A seed or a function

- **A seed** (a finite number) builds a seeded [mulberry32](../tools/tools-api.md#createseededrandom) generator: the
  same seed always yields the same stream. A generator carries its `seed`, and `state()` returns its position, so
  `createSeededRandom(rng.state())` continues an existing stream.
- **A function** returning numbers in `[0, 1)` is used as given. This is how an organiser can supply a source of
  their own, for example one backed by `crypto.getRandomValues`.
- **No argument** restores `Math.random`. Anything else is refused with `INVALID_VALUES`.

### `nonRandom` on a single call

Passing `nonRandom: <seed>` to a method call turns the seed into that call's own `random` function, so one mutation
is deterministic regardless of the configured source. `mocksEngine` accepts `nonRandom` for the same purpose when it
generates tournaments.

Where it is applied, at the time of writing: the synchronous engine's `engineInvoke` and `executionQueue`, and
`mocksEngine`. The asynchronous engine's invoke and execution queue do not transform `nonRandom`, so a server built on
it draws such a call from its configured source. Do not rely on `nonRandom` to make a server and a client agree until
that is resolved.

## Process-wide, not per request

The configured source is a run configuration, like `schemaWriteMode`: one setting covers every tournament and request
the process holds. That is the right scope for a test run, a corpus generator or a single-user client.

A server handling concurrent requests should know two things:

- Requests share one configured source. Setting a seeded source for one request changes the draws of every request
  running at the same time, and interleaves their streams.
- This differs from the [clock](./competition-clock.md): `setClock` is captured once per call, and a server's async
  state provider can scope it per request through `getCapturedClock`/`setCapturedClock`. The random source has no
  equivalent per-request scoping.

## Generate once, send the result

In TMX, random steps run once, on the client. The mutation that follows carries their outcome — the positions, seed
assignments and pairings chosen — rather than the call that chose them, so the server applies the same result and
never draws again. Randomness therefore decides a draw in exactly one place, and a replay of the mutation log
reproduces the draw without needing the source that produced it.

Rotating-partner pairing follows the same principle in miniature: the generators return `seedUsed`; save it to replay
the output ([rotating-partner pairing](./draw-types/rotating-partner-pairing.md)).

## Reproducibility

Under one seeded source, two generations of the same mocks tournament are byte-identical, ids included, and they stay
identical through scoring under a fixed clock. The [golden corpus](./outcome-pipeline.md#8-what-the-corpus-pins)
relies on this to regenerate itself.

What a seed reproduces is the **order of draws**, not a description of the result. If a change to the factory adds,
removes or reorders a random step, the same seed produces a different draw. A seed recorded to audit a draw is
therefore meaningful together with the factory version that consumed it.

## A seed is not a fairness guarantee

A source supplies numbers; the algorithm that consumes them decides whether the result is fair. A biased consumer —
for example, shuffling with a random sort comparator instead of a Fisher–Yates shuffle (`shuffleArray`) — stays
biased whatever source it is given. Changing the source changes which draw you get, not whether every draw was
equally likely.

`Math.random` is statistically adequate for draws, but it is not cryptographically secure. An organiser who needs draws
that cannot be predicted from earlier output can supply a cryptographic source as a function.
