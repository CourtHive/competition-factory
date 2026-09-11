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

Adds a single point to the score history. Part of the live scoring history tracking system.

```js
const result = scoreGovernor.addPoint({
  score, // current score object
  sideNumber, // 1 or 2 - which side won the point
});
```

**Purpose:** Track point-by-point scoring progression for detailed analytics.

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

| field | meaning |
| ----- | ------- |
| `pointsToGame` | `[number, number]` — minimum points each side needs to win the current game |
| `pointsToSet` | `[number, number]` — minimum points each side needs to win the current set |
| `pointsToMatch` | `[number, number]` — minimum points each side needs to win the match |
| `gamesToSet` | `[number, number]` — games each side needs to win the current set |
| `isBreakpoint` | `boolean` — the receiver is one point from winning the game |

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
const { valid, errors } = scoreGovernor.validateScore({
  matchUpFormat, // required - format to validate against
  score, // required - score object to validate
});
```

**Purpose:** Comprehensive score validation for data integrity.

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

const { isValid, error } = scoreGovernor.validateSetScore({
  set,
  matchUpFormat: 'SET3-S:6/TB7',
  isDecidingSet: false, // optional - whether this is the final set
  allowIncomplete: false, // optional - allow incomplete scores (for RETIRED/DEFAULTED)
});
```

**Tiebreak-only set example:**

```js
const set = { side1Score: 11, side2Score: 13 };
const { isValid } = scoreGovernor.validateSetScore({
  set,
  matchUpFormat: 'SET1-S:TB10',
});
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

const { isValid, error } = scoreGovernor.validateMatchUpScore({
  sets,
  matchUpFormat: 'SET3-S:6/TB7',
  matchUpStatus: 'COMPLETED', // optional - allows incomplete scores for RETIRED/DEFAULTED
});
```

**Best-of-3 TB10 example:**

```js
const sets = [
  { side1Score: 11, side2Score: 13 },
  { side1Score: 12, side2Score: 10 },
];

const { isValid } = scoreGovernor.validateMatchUpScore({
  sets,
  matchUpFormat: 'SET3-S:TB10',
});
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
