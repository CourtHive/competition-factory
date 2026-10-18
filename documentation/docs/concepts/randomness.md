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
| 2          | a stream derived from the seed   | `nonRandom: <seed>` on the call, for the code that takes no `random` (below)  | that call only    |
| 3          | the configured source            | `engine.setRandomSource(seed \| fn)` or `tools.setRandomSource(seed \| fn)`   | the whole process |
| 4          | `Math.random`                    | default                                                                       | the whole process |

The source is read at the moment of each draw, never captured when a module loads, so configuring or resetting it
takes effect on the next call.

### A seed or a function

- **A seed** (a finite number) builds a seeded [mulberry32](../tools/tools-api.md#createseededrandom) generator: the
  same seed always yields the same stream. A generator carries its `seed`, and `state()` returns its position, so
  `createSeededRandom(rng.state())` continues an existing stream.
- **A function** returning numbers in `[0, 1)` is used as given. This is how an organiser can supply a source of
  their own, for example one backed by `crypto.getRandomValues`.
- **No argument** restores `Math.random`. Anything else is refused with `INVALID_VALUES`.

A function source must actually vary, and the factory refuses one that does not. Ids are drawn from the source too,
and every lookup assumes ids are unique, so a source that repeats would build a broken draw. A constant used to send
BYE advancement into endless recursion: every matchUp's winner matchUp resolved to itself. So:

- `UUID` refuses an id that the same stream has already minted (it remembers the last 4,096 per stream). A working
  source never repeats four 32-bit draws, so this has no false positives.
- A configured function is checked at every draw: a value outside `[0, 1)` is refused.

Both throw an error whose message starts `DEGENERATE_RANDOM_SOURCE`. An engine call catches it and returns it as
`{ error }`. A restarted stream may repeat its ids, because that is what reproducing means. Setting the source again,
a new seed, or `nonRandom` on a call each begins a new stream. Restarting a function's internal state without setting
it again does not, and its repeated ids are refused. The repeat check covers sources configured with `setRandomSource`
and a call's own `random`; the range check covers configured functions. Neither judges whether a source is fair (see
below).

A record built elsewhere can still arrive with repeated ids, and the factory does not check every incoming record for
them, because that check would cost time on every load. Where repeated ids would send BYE advancement backwards, which
is the path that used to recurse, the engine refuses with an `INVALID_MATCHUP` error saying the record's matchUpIds are
not unique. Advancement must reach a later round of the same structure, or another structure.

### `nonRandom` on a single call

Passing `nonRandom: <seed>` to a method call turns the seed into that call's own `random` function, so one mutation
is deterministic regardless of the configured source. `mocksEngine` accepts `nonRandom` for the same purpose when it
generates tournaments.

Where it is applied: every engine entry point, synchronous and asynchronous — `engineInvoke` and `executionQueue`,
their async twins, and `mocksEngine` — through one shared transform. A server running the asynchronous engine and a
client replaying the same directive with the synchronous engine therefore draw the same result from the same seed
(see [the async engine](#the-async-engine) below). The transform removes `nonRandom` from the params once it has
become `random`, so a nested dispatch does not start a second stream.

A method's own `random` function can also be passed directly: to a named engine method, through `execute`, or in a
directive.

The seed covers **every** draw the call makes, not only those of code that takes a `random` parameter, on every entry
point: a named engine method, `execute`, each directive of `executionQueue`, `dryRun`, their async twins, and
`mocksEngine`. Code that does not take one (ids minted by draw, venue and tieFormat generation among them) reads, for
the duration of the call, a second stream derived from the same seed; the previous source is reinstated afterwards.
So a seeded `generateDrawDefinition` mints the same `drawId`, structure ids and matchUpIds every time, not only the
same placements. The seed's own stream keeps exactly the draws it always had, so what a seed already determined does not
change. So the same `nonRandom`, profile, clock and factory version give a byte-identical record whatever the
process's configured source is and whatever was generated before it, and a seeded call draws nothing from the
configured source. A `random` function passed directly instead of `nonRandom` does not get this: there is no seed to
derive the second stream from.

## Process-wide, not per request

The configured source is a run configuration, like `schemaWriteMode`: one setting covers every tournament and request
the process holds. That is the right scope for a test run, a corpus generator or a single-user client.

A server handling concurrent requests should know two things:

- Requests share one configured source. Setting a seeded source for one request changes the draws of every request
  running at the same time, and interleaves their streams.
- This differs from the [clock](./competition-clock.md): `setClock` is captured once per call, and a server's async
  state provider can scope it per request through `getCapturedClock`/`setCapturedClock`. The configured random source
  has no equivalent per-request scoping.
- A seeded engine call's derived stream is per request. It is held in the state provider through the optional
  `getCallRandomSource`/`setCallRandomSource` hooks, as the captured clock is, so one request's seeded stream never
  reaches a request running at the same time. A provider without the hooks scopes nothing: a seeded call there
  reproduces its placements but draws its ids from the configured source. `mocksEngine` scopes its derived stream
  process-wide for the duration of its synchronous call.

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

## Worked examples

Each example below is a test in `src/tests/global/randomnessExamples.test.ts`, and a test there checks that the page
shows exactly these blocks, so the two cannot drift apart. The comment on each block names its test. The examples
share an event with no draw yet, and compare draws by what they place where:

```ts
// randomnessExamples.test.ts › shared helpers
// what a draw IS, minus the ids it mints and the time it was made
const placements = (drawDefinition: any) =>
  drawDefinition.structures[0].positionAssignments.map(
    ({ drawPosition, participantId, bye, qualifier }: any) =>
      `${drawPosition}:${participantId ?? (bye && 'BYE') ?? (qualifier && 'QUALIFIER')}`,
  );

// one event of 25 entered participants and no draw yet, loaded fresh by each example
const fixture = mocksEngine.generateTournamentRecord({
  eventProfiles: [{ participantsProfile: { participantsCount: 25 } }],
  nonRandom: 1,
}).tournamentRecord;
const eventId = fixture.events[0].eventId;
const loadEvent = (engine: any = tournamentEngine) => engine.setState(structuredClone(fixture));
```

### A reproducible draw

A seed configured before generation reproduces the draw: positions, BYEs, qualifier slots, and the ids it mints.

```ts
// randomnessExamples.test.ts › a seeded source regenerates the same draw: positions, byes, qualifiers and ids
const drawProfiles = [{ drawSize: 32, participantsCount: 25, qualifiersCount: 2 }];
const seed = 20261013;

tournamentEngine.setRandomSource(seed);
const first = mocksEngine.generateTournamentRecord({ drawProfiles }).tournamentRecord;

tournamentEngine.setRandomSource(seed);
const second = mocksEngine.generateTournamentRecord({ drawProfiles }).tournamentRecord;

const [drawA] = first.events[0].drawDefinitions;
const [drawB] = second.events[0].drawDefinitions;
expect(drawB.drawId).toEqual(drawA.drawId);
expect(placements(drawB)).toEqual(placements(drawA));
```

### A function source

A deterministic stub is used as given; a cryptographic source is a one-line function.

```ts
// randomnessExamples.test.ts › a deterministic stub is used as given
let n = 1;
const stub = () => (n = (n * 16807) % 2147483647) / 2147483647; // Park–Miller: deterministic, never 1
tournamentEngine.setRandomSource(stub);
expect(tools.randomSource()()).toEqual(16807 / 2147483647); // the stub's first value
```

```ts
// randomnessExamples.test.ts › a crypto.getRandomValues-backed source is accepted and yields values in [0, 1)
const cryptoRandom = () => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;
tournamentEngine.setRandomSource(cryptoRandom);
```

### nonRandom outranks the configured source

```ts
// randomnessExamples.test.ts › the same call gives the same draw under two sources with nonRandom, and different draws without it
const drawUnder = (source: number, params: object) => {
  tournamentEngine.setRandomSource(source);
  return tournamentEngine.generateDrawDefinition({ eventId, drawSize: 32, ...params }).drawDefinition;
};

loadEvent();
const seededA = drawUnder(101, { nonRandom: 5 });
const seededB = drawUnder(202, { nonRandom: 5 });
expect(placements(seededB)).toEqual(placements(seededA)); // the call's seed decides

const unseededA = drawUnder(101, {});
const unseededB = drawUnder(202, {});
expect(placements(unseededB)).not.toEqual(placements(unseededA)); // the configured source decides
```

### Resetting the source

```ts
// randomnessExamples.test.ts › setRandomSource() restores Math.random, so a seed no longer repeats
tournamentEngine.setRandomSource(7);
const seeded = tools.randomSource()();
tournamentEngine.setRandomSource(7);
expect(tools.randomSource()()).toEqual(seeded); // seeded: the stream restarts

tournamentEngine.setRandomSource();
expect(tools.randomSource()).toBe(Math.random);
```

### Auditing a published seed

Publish the seed with the factory version that consumed it. Anyone holding the same entries can re-derive the draw,
whatever source their process has configured.

```ts
// randomnessExamples.test.ts › a draw made with nonRandom is re-derived from the recorded seed and factory version
loadEvent();
const seed = 731;
const { drawDefinition } = tournamentEngine.generateDrawDefinition({ eventId, drawSize: 32, nonRandom: seed });
const published = { seed, factoryVersion: tournamentEngine.version(), placements: placements(drawDefinition) };

// later, anywhere: same entries, same factory version, same seed, whatever source is configured
tournamentEngine.setRandomSource(999);
expect(tournamentEngine.version()).toEqual(published.factoryVersion);
const rederived = tournamentEngine.generateDrawDefinition({ eventId, drawSize: 32, nonRandom: published.seed });
expect(placements(rederived.drawDefinition)).toEqual(published.placements);
```

### What a seed does not promise

A seed reproduces an order of draws. One extra draw before the same steps, which is what a factory change that adds a
random step amounts to, gives a different draw.

```ts
// randomnessExamples.test.ts › one extra draw before the same seeded steps gives a different draw
loadEvent();
tournamentEngine.setRandomSource(42);
const before = tournamentEngine.generateDrawDefinition({ eventId, drawSize: 32 }).drawDefinition;

tournamentEngine.setRandomSource(42);
tools.UUID(); // one more random step, as a factory change might add
const after = tournamentEngine.generateDrawDefinition({ eventId, drawSize: 32 }).drawDefinition;

expect(placements(after)).not.toEqual(placements(before));
```

### A source that repeats is refused

```ts
// randomnessExamples.test.ts › a constant source is refused at its first repeated id, and a draw reports it as an error
tournamentEngine.setRandomSource(() => 0.5); // a constant: every draw is the same number
tools.UUID();
expect(() => tools.UUID()).toThrow('DEGENERATE_RANDOM_SOURCE'); // the same id, minted twice

loadEvent();
const result = tournamentEngine.generateDrawDefinition({ eventId, drawSize: 32 });
expect(result.error).toContain('DEGENERATE_RANDOM_SOURCE');
```

```ts
// randomnessExamples.test.ts › a short cycle is refused too
let n = 0;
tournamentEngine.setRandomSource(() => (n++ % 10) / 10); // 0, 0.1, … 0.9, then again
expect(() => tools.UUIDS(10)).toThrow('DEGENERATE_RANDOM_SOURCE');
```

```ts
// randomnessExamples.test.ts › a value outside [0, 1) is refused at the draw
tournamentEngine.setRandomSource(() => 1);
expect(() => tools.randomSource()()).toThrow('DEGENERATE_RANDOM_SOURCE');
```

### The async engine

The same directive carrying `nonRandom` produces the same draw on the asynchronous engine as on the synchronous one,
ids included, through `executionQueue`, `execute` and a named method, whatever source each process has configured. Before the shared
transform the asynchronous engine ignored `nonRandom` and drew from its configured source.

## A seed is not a fairness guarantee

A source supplies numbers; the algorithm that consumes them decides whether the result is fair. A biased consumer —
for example, shuffling with a random sort comparator instead of a Fisher–Yates shuffle (`shuffleArray`) — stays
biased whatever source it is given. Changing the source changes which draw you get, not whether every draw was
equally likely.

`Math.random` is statistically adequate for draws, but it is not cryptographically secure. An organiser who needs draws
that cannot be predicted from earlier output can supply a cryptographic source as a function.
