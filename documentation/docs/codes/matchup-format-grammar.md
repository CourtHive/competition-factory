---
title: matchUpFormat grammar specification
---

A matchUpFormat code is a string that describes how a matchUp is scored. This page states the rules a second
implementation has to reproduce without reading the TypeScript: which strings are codes, what `parse` returns for
each, what `stringify` writes, and which well-formed codes are refused for a new format. It is the grammar the
[scoring engine specification](/docs/scoring-engine/scoring-engine-spec) § 3 resolves; what a code _means_ for
scoring is stated there, not here. The [matchUpFormat codes](/docs/codes/matchup-format) page is the guide to
writing codes; where the two differ, this page is the rule.

First version, 2026-10-25, written from the parser's rules (`parse` refuses what `isValid` refuses, CA 2026-10-02;
the refusals for new use, CA 2026-10-18), the existing tests (`parseIsStrict.test.ts`, `matchUpFormatCode.test.ts`,
`crossSportFormats.test.ts`) and probes of factory `dev`. The four questions that draft left open were decided by CA
on 2026-10-25; each rule now stands in its section, marked "(CA 2026-10-25)", and § 8 keeps the record. The kernel
cases (`src/tests/testHarness/kernel/cases/grammar.json`, operations `kernel.format.parse@1`,
`kernel.format.stringify@1`, `kernel.format.canonical@1` and `kernel.format.isValid@1`) hold every rule below that a
case can show.

## 1. The three questions

| question                          | answer                                         | where it is asked                                           |
| --------------------------------- | ---------------------------------------------- | ----------------------------------------------------------- |
| **well-formed**: is it a code?    | `parse(code)` returns an object, not undefined | a stored format is read: scoring, timing, replay            |
| **valid for new use**             | `isValidMatchUpFormat({ matchUpFormat })`      | a format is set on a matchUp, structure, draw or collection |
| **canonical**: how is it written? | `stringify(parse(code))`                       | a format is written back                                    |

A valid code is well-formed; a well-formed code may not be valid (§ 6). Every well-formed code has exactly one
canonical spelling, and `parse` and `stringify` are inverse on it: `stringify(parse(c)) === c` for every canonical
`c`, and for every well-formed `c`, `stringify(parse(c))` is `c` with its equivalent spellings (§ 4) rewritten.

## 2. Lexical rules

1. **A code is a non-empty string.** Any other value, and `''`, is not a code.
2. **Nothing surrounds it.** A leading or trailing space, a newline, or any text after the last section
   (`SET3-S:6/TB7;DROP`) makes the string not a code. There is no trimming.
3. **Letters are upper case.** Roots, section keys, `NOAD`, `WB`, `TB`, `TN`, `C`, `D`, `DP`, `P`, `G`, `O`, `T`, `X`
   and `A` are upper case: `set3-S:6/TB7` and `SET3-S:6NoAD/TB7` are not codes.
4. **A number is a positive decimal integer** with no sign, no leading zero, no fraction and no exponent, and at most
   2⁵³ − 1: `0`, `06`, `6.0`, `6.5`, `1e1` and `9007199254740993` are not numbers. Every count, number of games,
   points, minutes, outs, margin and deuce count in a code is one.
5. **Sections are separated by `-`** and no section is empty: `SET3-S:6/TB7-`, `SET3--S:6/TB7` and `SET3-S:` are not
   codes.

## 3. Structure

A code is either the **simplified timed form** or a **match code**.

### 3.1 The simplified timed form

```text
T{minutes}[P|G][/TB{n}][@{modifier}]
```

A single timed segment, best of one: `T10`, `T10P`, `T20/TB7`, `T10P/TB1@RALLY`. The timed segment's rules are those
of a timed set (§ 3.4); its `G` is an equivalent spelling (§ 4).

### 3.2 The match code

```text
{root}{count}[X][A][{matchMods}]-S:{set}[-G:{game}][-F:{set}][-M:T{minutes}]
```

1. **The head.** A root, a count (a number, rule 2.4), then the match modifiers in this order: `X` (exactly), `A`
   (aggregate), then any other upper-case letters, each kept in order as an unknown match modifier
   (`SET3Z-S:6/TB7`, `SET3ZQ-S:6/TB7`). `SET3AX`, `SET3ZX` and `SET3XX` are not codes.
2. **The roots** are `SET`, `HAL`, `QTR`, `PER`, `INN`, `RND`, `FRM`, `MAP` and `MAT`. No other root is a code.
3. **The sections** follow the head in the order `S`, `G`, `F`, `M`. `S` is required; each of the others is optional
   and appears at most once. A section out of order (`SET3-S:6/TB7-F:TB10-G:3C`, `SET3-M:T90-S:6/TB7`), a repeated
   section, or any other key (`-Q:1`) makes the string not a code. A `-G:TN` out of order drops away as an
   equivalent spelling (§ 4) before the order is read.
4. **Exactly.** `X` makes every one of `count` segments played (`exactly: count`); without it the match is best of
   `count` (`bestOf: count`). `SET1X` is `SET1` (§ 4). **`X` is allowed on every root and every kind of segment**
   (CA 2026-10-25): `SET3X-S:6/TB7`, `SET3X-S:T10`, `SET2X-S:TB10` and `INN3X-S:6/TB7` are codes. The `SET` root
   used to require a timed segment.
5. **The final segment** (`-F:`) is allowed only when `count` is more than 1: `SET1-S:6/TB7-F:TB10` is not a code. A
   final segment identical to the set segment is an equivalent spelling (§ 4). Which set it governs is the scoring
   specification's § 3.2.
6. **A combined total** (`P…`, § 3.4) is allowed only as the `-S:` segment of `SET1`, with no `X`, `A`, match
   modifier, `-G:`, `-F:` or `-M:`; never as `-F:`.

### 3.3 Game and match sections

- **`-G:`**: `TN[{d}D]` (a traditional game, its d-th deuce decided by the next point) or `{n}C[{d}D]` (the first to
  win n points in a row). `TN0D`, `0C` and `3C0D` are not codes. `-G:TN` with no deuce count is the default game and
  an equivalent spelling of no `-G:` section (§ 4; CA 2026-10-25); `-G:TN3D` is not the default.
- **`-M:`**: `T{minutes}`, a match clock.

### 3.4 Segments

A segment (`-S:` or `-F:`) is exactly one kind, recognised by how it starts, in this order:

| kind           | written                                     | starts with   |
| -------------- | ------------------------------------------- | ------------- |
| combined total | `P{n}`, `P{n}DP`, `P{n}WB{m}` with m ≥ 2    | `P`           |
| tiebreak-only  | `TB{n}[NOAD][@{modifier}]`                  | `TB`          |
| outs           | `O{n}`                                      | `O`           |
| timed          | `T{minutes}[P\|G][/TB{n}][@{modifier}]`     | `T`, not `TB` |
| standard       | `{setTo}[NOAD][WB{w}][/TB{n}[NOAD]][@{at}]` | a digit       |

1. **Standard.** `NOAD` comes before `WB` (`6NOADWB1`, never `6WB1NOAD`). `WB{w}` is allowed only without a tiebreak.
   `@{at}` is allowed only with a tiebreak and is a number, the game count at which the tiebreak is played
   (`6/TB7@5`, `6/TB7@12`); a modifier name there is not a code (`6/TB7@RALLY`). The tiebreak may carry `NOAD`
   (`6/TB10NOAD`), a non-standard extension; a second tiebreak (`6/TB7/TB7`) is not a code.
2. **Tiebreak-only.** A tiebreak played as the whole set. `@` here introduces a modifier, never a number: `TB10@7` is
   not a code. `NOAD` is written before the modifier (`TB11NOAD@RALLY`); `TB11@RALLYNOAD` is not a code.
3. **Timed.** `P` builds points, `G` (the default, § 4) games. The tiebreak played when the segment ends level carries
   no `NOAD` (`T10/TB7NOAD` is not a code). `NOAD` in a timed modifier is not a code (`T10@RALLYNOAD`).
4. **A modifier** is the text after `@` on a tiebreak-only or timed segment: **one or more upper-case letters**, not
   containing `NOAD` (CA 2026-10-25). `TB11@rally`, `T10@rally`, `TB11@R_1` and `TB11@RALLY2` are not codes.
   `RALLY` is the one modifier with a meaning (every rally scores); any other upper-case name is kept and not scored
   (`TB11@SIDEOUT`; scoring specification § 3.4).

## 4. Equivalent spellings

These say the same thing as their canonical form and are well-formed; `stringify` writes the canonical form.

| equivalent spelling                                                   | canonical                                                              |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| a redundant `@{at}` equal to `setTo`                                  | `S:6/TB7@6` → `S:6/TB7`                                                |
| an explicit `WB2` (the default margin, no tiebreak)                   | `S:5WB2` → `S:5`                                                       |
| `X` on a count of 1                                                   | `SET1X-S:T10` → `SET1-S:T10`; `SET1XA` → `SET1A`                       |
| a final segment identical to the set segment, once both are rewritten | `SET3-S:6-F:6` → `SET3-S:6`; `SET3-S:6/TB7-F:6/TB7@6` → `SET3-S:6/TB7` |
| a timed segment's `G`                                                 | `T10G` → `T10`; `S:T20G/TB7` → `S:T20/TB7`                             |
| a `-G:TN` section with no deuce count, the default game               | `SET3-S:6/TB7-G:TN` → `SET3-S:6/TB7`                                   |

Nothing else is an equivalent spelling. A string that is not canonical once these are rewritten is not a code: that
is how leading zeros, sections out of order and modifiers out of order are refused (rule 2.4, § 3.2), and how the
three lenient readings below stay closed.

**Closed lenient readings** (CA 2026-10-02). Each was once read as `SET3-S:6/TB7` and printed canonically; each is
now not a code: a trailing space (`SET3-S:6/TB7 `), an empty final section (`SET3-S:6/TB7-F:`) and a tiebreak with no
number (`SET3-S:6/TB`, `SET3-S:6/TB7-F:6/TB`).

**An equivalent spelling parses to its canonical form's object** (CA 2026-10-25): `parse('SET3-S:6-F:6')` has no
`finalSetFormat`, `parse('T10G')` no `based`, and `parse('SET3-S:6/TB7-G:TN')` no `gameFormat`. Two codes that say
the same thing read the same.

## 5. What parse returns

`parse` returns undefined for a string that is not a code, and otherwise this object. A field marked _only when_ is
absent, never `false`, `null` or empty, when the condition does not hold.

| field               | value                                                                                                                                       |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `bestOf`            | `count`, unless `X` with a count above 1; `1` for the simplified form                                                                       |
| `exactly`           | `count`, only when `X` with a count above 1                                                                                                 |
| `setFormat`         | the `-S:` segment (below)                                                                                                                   |
| `finalSetFormat`    | the `-F:` segment, only when one is written and it is not the set segment                                                                   |
| `gameFormat`        | only when a `-G:` other than the default is written: `{ type: 'TRADITIONAL', deuceAfter }` or `{ type: 'CONSECUTIVE', count, deuceAfter? }` |
| `matchUpConstraint` | only when `-M:` is written: `{ timed: true, minutes }`                                                                                      |
| `matchRoot`         | the root, only when it is not `SET`                                                                                                         |
| `aggregate`         | `true`, only when `A` is written                                                                                                            |
| `matchMods`         | the unknown match modifiers as an array of one-letter strings, only when there are any                                                      |
| `simplified`        | `true`, only for the simplified timed form                                                                                                  |

A segment:

| kind           | object                                                                                                                                                                                                                                              |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| standard       | `{ setTo, NoAD?: true, tiebreakFormat: { tiebreakTo, NoAD?: true }, tiebreakAt }` with a tiebreak, `tiebreakAt` being `setTo` when no `@` is written; `{ setTo, NoAD?: true, noTiebreak: true, winBy? }` without one, `winBy` only when it is not 2 |
| tiebreak-only  | `{ tiebreakSet: { tiebreakTo, NoAD?: true, modifier? } }`                                                                                                                                                                                           |
| outs           | `{ outs }`                                                                                                                                                                                                                                          |
| timed          | `{ timed: true, minutes, based?: 'P', tiebreakFormat?: { tiebreakTo }, modifier? }`                                                                                                                                                                 |
| combined total | `{ combinedPointTotal, tieResolution: 'ALLOW' }`, `'DECIDING_POINT'` for `DP`, or `'WIN_BY_MARGIN'` with `winningMargin` for `WB{m}`                                                                                                                |

## 6. Valid for new use

`isValidMatchUpFormat` is false for anything that is not well-formed, and for two kinds of well-formed code that are
refused for a new format and still read where they are stored (scoring specification § 16, decision 19; CA
2026-10-18):

1. **A tiebreak below S − 1.** A standard segment, `-S:` or `-F:`, whose tiebreak is played at fewer than `setTo − 1`
   games: `SET3-S:4/TB7@2` and `SET3-S:6/TB7@4` are refused; `SET3-S:4/TB7@3`, `SET3-S:6/TB7@5` and
   `SET5-S:6/TB7-F:6/TB7@12` are valid.
2. **An aggregate of standard sets.** With `A`, a standard `-S:` segment, or a standard `-F:` segment when the code
   has no `X` (with `X` the final segment is the decider, set N + 1, which is not summed): `SET3A-S:6/TB7` and
   `SET3A-S:T10-F:6` are refused; `SET3XA-S:T10-F:6` is valid.

A stored code of either kind parses and scores as it always did; only setting it is refused
(`UNRECOGNIZED_MATCHUP_FORMAT`).

## 7. What stringify writes

`stringify` is specified on the objects `parse` returns: for each it writes the canonical code (§ 1). It writes the
sections in the order `S`, `G`, `F`, `M`, omits a final segment identical to the set segment, a final segment on a
count of 1 and the default game (`TRADITIONAL` with no `deuceAfter`), writes `winBy` only when it is not 2,
`tiebreakAt` only when it is not `setTo`, `based` only when it is `P`, and the head as root, count, `X` (only for a count above 1), `A`, then the match modifiers. With its second
argument, `preserveRedundant`, it also writes a `tiebreakAt` equal to `setTo`.

On other objects it never writes a string `parse` refuses. It returns undefined for a value that is not an object, an
object with neither `bestOf` nor `exactly` or with no `setFormat`, a game format it cannot write, a modifier that is
not upper-case letters (a tiebreak modifier `'2'` would be written `6/TB7@2`, which reads back as a tiebreak at two
games), and a combined total anywhere § 3.2 rule 6 does not allow it. Beyond those, its result on
an object `parse` could not have returned is not specified.

## 8. Decisions

The first draft left four questions open; CA decided each on 2026-10-25. The kernel cases that pin them carry the
date in their notes.

1. **`-G:TN` is an equivalent spelling of no `-G:` section** (§ 3.3, § 4). It was a second canonical spelling of the
   default game, parsed with `gameFormat: { type: 'TRADITIONAL' }`.
2. **An equivalent spelling parses to its canonical form's object** (§ 4, § 5). `SET3-S:6-F:6` kept the redundant
   `finalSetFormat`, and `T10G` kept `based: 'G'`.
3. **A modifier is upper-case letters** (§ 3.4 rule 4). `TB11@rally`, `T10@rally` and `TB11@R_1` were well-formed and
   valid for new use; the engine switches rally scoring on only for `RALLY`, so `@rally` scored side-out, the same
   silent reinterpretation the closed `@RALLYNOAD` reading had (validator debate G8).
4. **`X` is allowed on every root and every kind of segment** (§ 3.2 rule 4). `SET3X-S:6/TB7` was not a code while
   `INN3X-S:6/TB7` was; the scoring specification § 3.4 reads both alike, and the scoring conformance cases for the
   `SET`-root cells (`timedSegments`, `tiebreakSets`) hold that they score as their siblings on other roots do.

Measured against the factory's own formats: no fixture, test or harvested code uses a bare `-G:TN` or a modifier
that is not upper-case letters; the codes that newly parse (`SET3X-S:6/TB7`, `SET4X-S:6`, `SET2X-S:TB10`,
`SET3XA-S:O3`, `SET7XA-S:TB11`) were each written by a test or a page expecting them to. No corpus scenario's
content moved; three `SET3-S:6-F:6` scoring scenarios are filed under the cell their format now reads as.

**Measured in production 2026-10-25** (read-only, every tournament record: 49,936 tournaments, 715,482 stored
`matchUpFormat` values, 106 distinct codes, from events, draws, structures, matchUps and tieFormat collections). Every
one of the 106 parses, and none reads differently under these rulings: the same parse object, canonical form and
validity before and after. No stored code uses `-G:TN`, a modifier that is not upper-case letters, `X` on a `SET`-root
standard set, or a final segment identical to the set segment. Four stored codes are equivalent spellings (a redundant
`@{at}`: `SET3-S:4/TB7@4-F:TB10`, 1,137 values in 33 tournaments, and three rarer ones), and four are refused for new
use and read where stored (§ 6: `SET1-S:10/TB7@8`, `SET1-S:11/TB7@8`, `SET1-S:12/TB7@8` and `SET3A-S:6/TB7-F:TB10`,
seven values in four tournaments).
