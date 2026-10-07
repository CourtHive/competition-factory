---
title: Score Governor
---

```js
import { scoreGovernor } from 'tods-competition-factory';
```

The **scoreGovernor** is a collection of scoring related tools that provide analysis/validation or generate values.

Lightweight independent/reusable components such as scoring dialogs can make use of the **scoreGovernor** without having to import any Competition Factory engines.

The scoreGovernor also re-exports the `ScoringEngine` class and `addPoint` for point-by-point scoring — see [ScoringEngine Methods](#scoringengine-methods) at the end of this page.

---

## addPoint

Adds a single point to a scoring matchUp. Part of the live scoring history tracking system.

```js
const matchUp = scoreGovernor.addPoint(
  matchUp, // scoring matchUp; mutated in place and returned
  { winningSide: 1 }, // AddPointOptions: `winner` (0 | 1) or `winningSide` (1 | 2), plus optional server and metadata
  config, // optional - { pointMultipliers }
);
```

**Purpose:** Track point-by-point scoring progression for detailed analytics.

A point added after the matchUp is `COMPLETED` is ignored, not refused: the matchUp is returned
unchanged (since 7.5.0). See [ScoringEngine addPoint](../scoring-engine/scoring-engine-api.md#addpoint)
for the full `AddPointOptions`.

---

## analyzeSet

```js
const {
  expectTiebreakSet,
  expectTimedSet,
  hasTiebreakCondition,
  isCompletedSet,
  isDecidingSet,
  isTiebreakSet,
  isValidSet,
  isValidSetNumber,
  isValidSetOutcome,
  setFormat,
  sideGameScores,
  sideGameScoresCount,
  sidePointScores,
  sidePointScoresCount,
  sideTiebreakScores,
  sideTiebreakScoresCount,
  winningSide,
} = scoreGovernor.analyzeSet({
  matchUpScoringFormat,
  setObject,
});
```

---

## analyzeScore

Analyzes a complete score object to extract detailed scoring information across all sets.

```js
const analysis = scoreGovernor.analyzeScore({
  matchUpFormat, // required - match format
  score, // required - score object with sets
});

console.log(analysis.sets); // Array of analyzed set objects
console.log(analysis.winningSide); // 1, 2, or undefined
console.log(analysis.isComplete); // boolean
```

**Purpose:** Comprehensive score analysis for validation and display.

---

## calculatePointsTo

How many points each side still needs, at the current score.

**Takes positional arguments**, not a params object — it predates the destructured convention and
`scoreGovernor` re-exports it unchanged. Calling it through an engine (`engine.calculatePointsTo({…})`)
passes the params object as `matchUp` and yields nothing useful; import the governor instead.

```js
import { scoreGovernor } from 'tods-competition-factory';

const formatStructure = scoreGovernor.parseMatchUpFormat('SET3-S:6/TB7');

const needed = scoreGovernor.calculatePointsTo(
  matchUp, // ScoringEngine.getState() — reads `matchUp.score.sets`
  formatStructure,
  'standard', // 'standard' | 'tiebreakOnly' | 'matchTiebreak' | 'timed'
  formatStructure.setFormat,
  0, // server: 0 | 1 | undefined
);
```

Returns **`PointsToDecoration | undefined`** — a published type, so a consumer should import it
rather than redeclare the shape:

```ts
import type { PointsToDecoration } from 'tods-competition-factory';
```

| field           | meaning                                                                     |
| --------------- | --------------------------------------------------------------------------- |
| `pointsToGame`  | `[number, number]` — minimum points each side needs to win the current game |
| `pointsToSet`   | `[number, number]` — minimum points each side needs to win the current set  |
| `pointsToMatch` | `[number, number]` — minimum points each side needs to win the match        |
| `gamesToSet`    | `[number, number]` — games each side needs to win the current set           |
| `isBreakpoint`  | `boolean` — the receiver is one point from winning the game                 |

"Minimum" assumes the side wins every subsequent point.

`undefined` is returned for a **timed** set and when `activeSetFormat` is absent — neither has a
point structure to count against. That is a legitimate answer, not a failure.

**Most callers do not need this function directly.** `ScoringEngine.getEpisodes()` already runs it
per point and exposes the result as `episode.needed` — see
[getEpisodes](#getepisodes-and-episodeneeded) below.

---

## inferServeSide

Which court side the serve comes from, at the current score. Also positional.

```js
const side = scoreGovernor.inferServeSide(matchUp, formatStructure, 'standard');
// 'deuce' | 'ad' | undefined
```

The rule is parity, and what is counted depends on the format: total points in the game for standard
tennis, aggregate score for aggregate formats such as INTENNSE, total tiebreak points inside a
tiebreak. A **timed** set returns `undefined` — there is no countable point structure to take a
parity of.

---

## getEpisodes and EpisodeNeeded

`ScoringEngine.getEpisodes()` returns one `Episode` per point, enriched with game, set and match
context. **`episode.needed` is `calculatePointsTo`'s output**, computed per point:

```js
const engine = new scoreGovernor.ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
engine.addPoint({ winner: 0 });

const episodes = engine.getEpisodes();
episodes[0].needed; // { pointsToGame, pointsToSet, pointsToMatch, gamesToSet }
```

`Episode`, `EpisodeNeeded` and `EpisodePoint` are all published types. **This is the contract a
points-to visualization should build against** — a renderer plotting "points needed to win the set"
is plotting `episode.needed.pointsToSet`.

---

## checkScoreHasValue

Checks if a score object contains any actual scoring data.

```js
const hasValue = scoreGovernor.checkScoreHasValue({
  score, // required - score object to check
});
```

**Returns:** `true` if score contains sets with values, `false` otherwise.

**Purpose:** Determine if a matchUp has been scored.

---

## checkSetIsComplete

```js
const hasWinningSide = scoreGovernor.checkSetIsComplete({
  set: {
    side1Score,
    side2Score,
    ignoreTiebreak,
    matchUpFormat,
    isDecidingSet,
    isTiebreakSet,
  },
});
```

---

## generateScoreString

```js
const sets = [
  {
    side1Score: 6,
    side2Score: 7,
    side1TiebreakScore: 3,
    side2TiebreakScore: 7,
    winningSide: 2,
  },
  {
    side1Score: 7,
    side2Score: 6,
    side1TiebreakScore: 14,
    side2TiebreakScore: 12,
    winningSide: 1,
  },
  { side1Score: 3 },
];
let result = scoreGovernor.generateScoreString({
    sets, // CODES sets object
    winningSide, // optional - 1 or 2
    reversed, // optional - reverse the score
    winnerFirst = true, // optional - boolean - tranform sets so that winningSide is first (on left)
    matchUpStatus, // optional - used to annotate scoreString
    addOutcomeString, // optional - tranform matchUpStatus into outcomeString appended to scoreString
    autoComplete: true, // optional - complete missing set score
  });
```

---

## getMaxSetScore

Returns the largest games score a side can legally reach under a set format, or `undefined` where
the format has no ceiling. Written for score-entry interfaces, which need to refuse a value that
cannot become a legal score as it is typed.

```js
const maxScore = scoreGovernor.getMaxSetScore({
  opponentScore, // optional - tightens the ceiling where the format has a tiebreak
  tiebreakAt, // optional - games at which a tiebreak is played
  tiebreakTo, // optional - target of a tiebreak-only set
  setTo, // games required to win the set
  winBy, // optional - game margin where there is no tiebreak; defaults to 2
  timed, // optional - boolean; a timed set
  NoAD, // optional - boolean; no-advantage
});
```

| set format               | call                                            | result      |
| ------------------------ | ----------------------------------------------- | ----------- |
| `S:6/TB7`                | `{ setTo: 6, tiebreakAt: 6 }`                   | `7`         |
| `S:6/TB7`, opponent on 3 | `{ setTo: 6, tiebreakAt: 6, opponentScore: 3 }` | `6`         |
| `S:6/TB7@5`              | `{ setTo: 6, tiebreakAt: 5 }`                   | `6`         |
| `S:6NOAD`                | `{ setTo: 6, NoAD: true }`                      | `6`         |
| `S:6` (advantage set)    | `{ setTo: 6 }`                                  | `undefined` |
| `S:TB10` (tiebreak-only) | `{ tiebreakTo: 10 }`                            | `undefined` |
| timed set                | `{ timed: true }`                               | `undefined` |

**`undefined` is an answer, not an error.** An advantage set, a tiebreak-only set and a timed set
can each run past any number, so an interface that assumes a maximum will refuse legitimate scores.

---

## getSetComplement

Returns complementary sideScore given a `lowValue`, `tieBreakAt` and `setTo` details.

```js
const [side1Score, side2Score] = scoreGovernor.getSetComplement({
  tiebreakAt,
  lowValue,
  isSide1,
  setTo,
});
```

---

## getTiebreakComplement

Returns complementary sideScore given a `lowValue`, `tieBreakNoAd` and `tiebreakTo` details.

```js
const [side1Score, side2Score] = scoreGovernor.getSetComplement({
  tiebreakNoAd, // boolean whether tiebreak is "no advantage"
  tiebreakTo,
  lowValue,
  isSide1,
});
```

---

## generateTieMatchUpScore

Returns string representation of current tieMatchUp score.

```js
const { scoreStringSide1, scoreStringSide2, set, winningSide } = scoreGovernor.generateTieMatchUpScore({
  matchUp, // must have { matchUpType: 'TEAM' }
  separator, // optional - defaults to '-'
});
```

---

## isValidMatchUpFormat

Returns boolean indicating whether matchUpFormat code is valid.

```js
const valid = scoreGovernor.isValidMatchUpFormat({ matchUpFormat });
```

---

## keyValueScore

Utility for generating score strings based on key entry. Please see `keyValueScore.test.js` in the source for more detail.

---

## parseScoreString

Produces CODES sets objects.

```js
const sets = mocksEngine.parseScoreString({ scoreString: '1-6 1-6' });

/*
console.log(sets)
[
  ({
    side1Score: 1,
    side2Score: 6,
    side1TiebreakScore: undefined,
    side2TiebreakScore: undefined,
    winningSide: 2,
    setNumber: 1,
  },
  {
    side1Score: 1,
    side2Score: 6,
    side1TiebreakScore: undefined,
    side2TiebreakScore: undefined,
    winningSide: 2,
    setNumber: 2,
  })
];
*/
```

---

## parse

Parses a matchUpFormat code string into a structured format object. Alias for `parseMatchUpFormat`.

```js
const format = scoreGovernor.parse({
  matchUpFormatCode, // required - format code string (e.g., 'SET3-S:6/TB7')
});
```

**Purpose:** Convert format code strings to structured format objects.

---

## repairScore

The **ingestion** fallback for a score a results feed recorded impossibly. Never use it for a live
entry: a person entering a score is held to it.

```js
const { score, warnings } = scoreGovernor.repairScore({
  matchUpFormat, // required - the format the score is played to
  score, // required - { sets }
});
```

It makes one repair. A set whose games are a tiebreak result (`7-6` under `@6`) but whose tiebreak
points no tiebreak can end on (`7-6(10-7)` with a tiebreak to seven) loses those points and keeps
`7-6`. A `7-6` with no points is a recordable set, so this keeps everything the feed knew for certain:
who won the set, and that it went to a tiebreak.

Anything else is returned untouched, for `setMatchUpStatus` to refuse. Each repaired set is named in a
warning, `{ code: 'INVALID_TIEBREAK_POINTS_DROPPED', setNumbers }` (`scoreWarningConstants`). The
caller then writes the returned score as usual.

---

## retainScoreForFormat

Returns which of the sets already entered survive a change of `matchUpFormat`, and which do not.
It lets a scoring interface keep the work a format change did not touch instead of clearing the
whole score.

```js
const { sets, discarded, reason, unchanged } = scoreGovernor.retainScoreForFormat({
  previousMatchUpFormat, // optional - the format being moved FROM; pass it whenever it is known
  matchUpFormat, // the format being moved TO
  sets, // the sets entered so far, in set order
});
```

| attribute   | value                                                                         |
| ----------- | ----------------------------------------------------------------------------- |
| `sets`      | the sets that survive, in order and untouched                                 |
| `discarded` | the sets that do not, so a caller can say what is being lost                  |
| `reason`    | why the first discarded set failed; present only when something was discarded |
| `unchanged` | `true` when nothing was discarded                                             |

The rule is applied to each set in order:

1. A set past the new format's set count is discarded.
2. A set whose format at that position has not changed is kept as it is, finished or part-entered.
3. Any other set is kept only if it is a complete, legal set under the new format.

Everything after the first discarded set is discarded with it. A set is kept or dropped whole, and
nothing is ever rescaled: a 10-8 match tiebreak that becomes a `TB7` is discarded, not rewritten.

```js
const sets = [
  { setNumber: 1, side1Score: 6, side2Score: 3 },
  { setNumber: 2, side1Score: 4, side2Score: 6 },
  { setNumber: 3, side1Score: 2, side2Score: 1 }, // part-entered
];

scoreGovernor.retainScoreForFormat({
  previousMatchUpFormat: 'SET3-S:6/TB7',
  matchUpFormat: 'SET3-S:6NOAD/TB7-F:TB10',
  sets,
});
// {
//   sets: [ set 1, set 2 ],
//   discarded: [ set 3 ],
//   reason: 'Tiebreak-only set winner must reach at least 10, got 2',
//   unchanged: false,
// }
```

Without `previousMatchUpFormat` rule 2 cannot apply, so every part-entered set is discarded.

It does not decide whether to warn, ask or proceed; that is the caller's.

---

## reverseScore

Reverses the perspective of a score (swaps side1 and side2).

```js
const reversedScore = scoreGovernor.reverseScore({
  score, // required - score object to reverse
});
```

**Purpose:** Display score from opponent's perspective.

---

## stringify

Converts a structured matchUpFormat object to a format code string. Alias for `stringifyMatchUpFormat`.

```js
const code = scoreGovernor.stringify({
  matchUpFormat, // required - format object
});
```

**Purpose:** Convert format objects to compact code strings.

---

## validateScore

Validates a complete score object against a matchUpFormat.

```js
const { valid, warnings, error, info } = scoreGovernor.validateScore({
  score, // required - score object to validate
  matchUpFormat, // format to validate against; required whenever any set holds a value
  matchUpStatus, // optional - the status the score is recorded with (e.g. COMPLETED, RETIRED)
  winningSide, // optional - 1 or 2; must agree with the winner the score calculates
});
```

**Purpose:** Comprehensive score validation for data integrity.

**Returns:** `{ valid: true }`, or `{ valid: true, warnings }` (below), when the score is accepted;
otherwise `{ error, info }`, where `info` names the reason. The refusals include:

- `INVALID_MATCHUP_STATUS` when `matchUpStatus` is given and is not a known matchUpStatus (since 7.5.0).
- `MISSING_MATCHUP_FORMAT` when any set holds a value and no `matchUpFormat` is given: a score cannot be
  checked without a format (since 7.5.0). A score with no set values is valid without one.
- `INVALID_VALUES` for a malformed set (non-numeric scores, a score on one side only, duplicate
  `setNumber`s, a `winningSide` other than 1 or 2).
- `INVALID_SCORE` when the score does not fit the format, its sets are not ones the format can finish,
  or `winningSide` does not match the calculated winner.

A valid score can carry `warnings`. A set decided by its tiebreak and recorded on games alone (`7-6`
with no tiebreak points) is valid, and is named in `{ code: 'TIEBREAK_POINTS_NOT_RECORDED',
setNumbers }`. A tiebreak-only set (a match tiebreak) recorded as `1-0` in its GAME fields with no
points is valid too: it is the marker of a set won with its points unrecorded. A `1-0` in the
tiebreak-point fields is points, and is refused unless the tiebreak is played to one (`TB1`).

---

## validateSetScore

Validates a single set score against matchUpFormat rules. Returns `{ isValid: boolean, error?: string }`.

Supports all matchUpFormat variations including:

- Standard formats (SET3-S:6/TB7)
- Tiebreak-only sets (SET1-S:TB10, SET3-S:TB7)
- Pro sets (SET1-S:8/TB7)
- Short sets (SET3-S:4/TB7)
- NOAD formats (SET3-S:6NOAD/TB7NOAD)

```js
const set = {
  side1Score: 7,
  side2Score: 6,
  side1TiebreakScore: 7,
  side2TiebreakScore: 5,
};

const { isValid, error } = scoreGovernor.validateSetScore(
  set,
  'SET3-S:6/TB7', // matchUpFormat
  false, // isDecidingSet, optional - whether this is the final set
  false, // allowIncomplete, optional - allow incomplete scores (for RETIRED/DEFAULTED)
);
```

**Tiebreak-only set example:**

```js
const set = { side1Score: 11, side2Score: 13 };
const { isValid } = scoreGovernor.validateSetScore(set, 'SET1-S:TB10');
// isValid: true - TB10 set with valid win-by-2 score
```

---

## validateMatchUpScore

Validates all sets in a matchUp score against matchUpFormat rules. Returns `{ isValid: boolean, error?: string }`.

Automatically handles:

- Multiple set validation
- Final set format variations
- Irregular endings (RETIRED, WALKOVER, DEFAULTED)

```js
const sets = [
  { side1Score: 6, side2Score: 4 },
  { side1Score: 3, side2Score: 6 },
  { side1Score: 7, side2Score: 5 },
];

const { isValid, error } = scoreGovernor.validateMatchUpScore(
  sets,
  'SET3-S:6/TB7', // matchUpFormat
  'COMPLETED', // matchUpStatus, optional - allows incomplete scores for RETIRED/DEFAULTED
);
```

An unknown `matchUpStatus` returns `{ isValid: false, error }` (since 7.5.0).

**Best-of-3 TB10 example:**

```js
const sets = [
  { side1Score: 11, side2Score: 13 },
  { side1Score: 12, side2Score: 10 },
];

const { isValid } = scoreGovernor.validateMatchUpScore(sets, 'SET3-S:TB10');
// isValid: true - both TB10 sets have valid win-by-2 scores
```

---

## validateTieFormat

Provides validation for `tieFormat` objects. See [tieFormats](/docs/concepts/tieFormat).

```js
const {
  valid, // boolean whether valid or not
  error,
} = scoreGovernor.validateTieFormat({
  checkCollectionIds, // ensure collectionId is present on all collections
  enforceGender,
  tieFormat,
  gender,
});
```

---

## ScoringEngine Methods

The following methods are available on `ScoringEngine` instances, not as standalone `scoreGovernor` exports. The `ScoringEngine` class is re-exported from the scoreGovernor for convenience.

```js
import { scoreGovernor } from 'tods-competition-factory';
const { ScoringEngine } = scoreGovernor;

const engine = new ScoringEngine({ matchUpFormat });
```

Instance methods include:

- `addGame({ sideNumber })` — add a completed game to score history
- `addSet({ setObject })` — add a completed set to score history
- `addShot({ shotDetails })` — add shot detail for advanced analytics
- `calculateHistoryScore({ matchUpFormat, history })` — reconstruct score from event history
- `clearHistory()` — reset history tracking while preserving current score
- `setServingSide({ sideNumber })` — set which side is currently serving
- `undo()` — undo the last scoring action
- `redo()` — redo the last undone scoring action
- `umo({ count })` — undo multiple operations at once
