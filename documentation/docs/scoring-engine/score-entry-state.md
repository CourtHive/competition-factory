---
title: Score Entry State
---

`tods-competition-factory/score-entry-state` is a headless score-entry **state engine**. Its value is a **score
state**: what an operator has typed and chosen for one matchUp, before anything is submitted. It is the engine behind
courthive-components' score-entry dialog, published on its own entry point so a host with no DOM and no tournament
engine (a mobile app, a worker, a server) can hold the same score state under the same rules.

```js
import * as scoreEntry from 'tods-competition-factory/score-entry-state';
```

The entry point loads the state engine and the factory scoring rules it reads, and nothing else. It does not load the
package root, an engine, global engine state, `async_hooks` or any DOM API, and it ships in both ESM and CommonJS with
its own type declarations. `verify:score-entry-state` holds that.

## What it owns, and what it does not

The score state holds the score as entered, cell by cell (a half-entered set is kept), the ending (retired, walkover, a
double exit, a suspension, ...) with its reason code, and the answers derived from them: the score line, whether the
result is complete, who won, what is wrong, and what Submit would send.

It never loads a record, holds a tournament, authorizes a caller, performs advancement, queries a network or submits a
mutation. The host supplies the matchUp format, any saved score and ending, the statuses its own `SCORE` action refuses,
and whether a recorded result may be cleared. It submits the outcome itself, for example to a server's `executionQueue`
as a `setMatchUpStatus` call.

## A score state, start to finish

```js
import * as scoreEntry from 'tods-competition-factory/score-entry-state';

// open a score state, empty or from a recorded matchUp
let model = scoreEntry.createScoreEntryModel({
  matchUpFormat: 'SET3-S:6/TB7',
  sets: matchUp?.score?.sets,
  matchUp, // hydrates a recorded ending and reason code
});

// type: a 4 into side 1's first set, deriving the other side (6-4 to side 2)
const games = (setIndex, side) => ({ setIndex, side, kind: 'games' });
model = scoreEntry.typeDigit(model, { cell: games(0, 1), digit: 4, complement: true });
model = scoreEntry.typeDigit(model, { cell: games(1, 1), digit: 3, complement: true });

scoreEntry.scoreString(model); // '4-6 3-6'
scoreEntry.isComplete(model); // true
scoreEntry.winningSide(model); // 2

// what Submit sends, under the host's restrictions
const view = { model };
const gate = scoreEntry.clearGate({
  openedOnRecordedOutcome: !!matchUp?.score?.sets?.length,
  cleared: false,
  holdsEntry: scoreEntry.holdsEntry(view),
});
const reported = scoreEntry.submission(view, gate, { disabledMatchUpStatuses });

// the outcome setMatchUpStatus reads
const outcome = reported && scoreEntry.toEngineOutcome({ ...reported, sets: scoreEntry.enteredSets(model) });
```

Every transition returns a new model. One that refuses (a digit past the set's ceiling, a cell that does not exist)
returns the **same** object, so a caller can tell a refusal from a change by identity.

## The API

| Group                 | Members                                                                                                                                                                                                                                                                                                                       |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| create and change     | `createScoreEntryModel`, `typeDigit`, `setCell`, `clearCell`, `clearScore`, `clearAll`, `chooseEnding`, `changeFormat`, `switchApproach`, `replaceSets`                                                                                                                                                                       |
| what it means         | `scoreString`, `isComplete`, `winningSide`, `matchUpStatus`, `enteredSets`, `completedSets`, `hasEntry`, `columns`, `isSettled`, `tiebreakOutstanding`, `cellValue`, `scoreEntryIssue`, `unrecordedTiebreakSets`, `discardedScore`, `resolveEnding`                                                                           |
| what may be submitted | `submission`, `footerState`, `clearGate`, `clearHeadline`, `endingOffered`, `endingRefusal`, `scoreEntryProblem`, `statusOutOfScope`, `retractEndingContradictedByScore`, `clearScoreForEnding`, `scoreLocked`, `holdsEntry`, `scoreEntered`, `scoreIsFinished`, `resolutionInForce`                                          |
| the outcome           | `toEngineOutcome`, `positionalCodes`                                                                                                                                                                                                                                                                                          |
| endings and reasons   | `chooseSideEnding`, `chooseMatchEnding`, `toggleBothSidesOut`, `chooseReasonCode`, `hydrateScoreEntryState`, `resolveScoreEntry`, `sideEndingOptions`, `matchEndingOptions`, `codesForStatus`, `recordedStatusCode`, `resolveIrregularEnding`, `hydrateIrregularEnding`                                                       |
| format rules          | `matchUpConfigFor`, `getSetFormatForIndex`, `isMatchComplete`, `getMatchWinner`, `getSetWinner`, `isSetComplete`, `getMaxAllowedScore`, `calculateComplement`, `shouldShowTiebreak`, `buildSetScore`, `isOvertimeFormat`, `overtimeProgress`, `overtimePhaseOf`, `isCompletedLevelClose`, `completeTiebreakOnly`, `scoreLine` |

## Problems are codes

The state engine reports what is wrong as data, and a host words it:

```js
scoreEntry.scoreEntryIssue(model);
// { code: 'TIEBREAK_CONTRADICTION', setIndex: 0, gamesWinner: 1 }
// { code: 'INVALID_SET', setIndex: 1, message: '...' }   // the factory's own words
// { code: 'SET_HAS_NO_SCORE', setIndex: 0 } | { code: 'SET_NOT_FINISHED', setIndex: 0 }
// { code: 'OVERTIME_REFUSED', setIndex: 4, message: '...' }

scoreEntry.endingRefusal('RETIRED', view); // 'ENDING_NEEDS_SCORE'
```

## The outcome

`toEngineOutcome` produces the shape `setMatchUpStatus` reads:

- a played result carries `score.sets`, `winningSide` and `matchUpStatus`;
- a reason code travels as a positional `matchUpStatusCodes` array: the side that did not win at its index for a single
  exit, both for a double exit, index 0 for an ending that resolves nobody;
- a clear is `{ score: { sets: [] }, matchUpStatusCodes: [] }`, which removes the score and the codes;
- a format changed in the score state rides along as `matchUpFormat`.

`setMatchUpStatus` writes the derived score strings into the outcome it is given, so pass a copy if you reuse it.

## Format editors (unreleased)

This subpath additionally exports `parseMatchUpFormat`, `stringifyMatchUpFormat` and
`retainScoreForFormat`, `finalSetGoverns`, `aggregateDeciderSetNumber` and `checkSetIsComplete` from this subpath. They are the existing canonical functions, exported directly; the
format picker needs no root factory import or governor. These additions are not part of published 7.43.0 or 7.44.0.
`RetainScoreArgs` and `RetainedScore` describe the retention input and report.

Use `changeFormat(model, nextCode)` to change the score state. Use `retainScoreForFormat` only to explain which
sets that change discards, passing `previousMatchUpFormat` when known. It reports the kept sets, discarded sets
and validator reason; it neither authorizes changing a tournament's format nor persists the change. CFS must
validate the offered action again when executing the command.
