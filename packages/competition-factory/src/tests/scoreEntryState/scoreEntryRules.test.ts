/**
 * The score state's rules as codes: what is wrong with a score, which endings are offered and why not, what Clear and
 * Submit do. courthive-components words these codes (its tests pin the sentences); here they are pinned as data.
 */
import { describe, expect, it } from 'vitest';
import {
  retractEndingContradictedByScore,
  isCompletedCombinedPointTie,
  contradictsFinishedScore,
  unrecordedTiebreakSets,
  createScoreEntryModel,
  isCompletedLevelClose,
  clearScoreForEnding,
  recordedStatusCode,
  normalizeStatusCode,
  resolutionInForce,
  scoreEntryProblem,
  groupKeyForStatus,
  scoreIsFinished,
  scoreEntryIssue,
  codesForStatus,
  discardedScore,
  completedSets,
  endingOffered,
  endingRefusal,
  matchUpStatus,
  clearHeadline,
  scoreEntered,
  winningSide,
  chooseEnding,
  footerState,
  scoreLocked,
  isComplete,
  submission,
  holdsEntry,
  clearGate,
  columns,
  setCell,
} from '../../scoreEntryState';

// constants and types
import type { CellRef, ScoreEntryModel, ScoreEntryView } from '../../scoreEntryState';
import { matchUpStatusConstants } from '@Constants/index';

const { RETIRED, WALKOVER, DEFAULTED, SUSPENDED, CANCELLED, DOUBLE_WALKOVER, DOUBLE_DEFAULT, COMPLETED, IN_PROGRESS } =
  matchUpStatusConstants;

const G = (setIndex: number, side: 1 | 2): CellRef => ({ setIndex, side, kind: 'games' });
const TB = (setIndex: number, side: 1 | 2): CellRef => ({ setIndex, side, kind: 'tiebreak' });

function typed(matchUpFormat: string, ...sets: Array<[number?, number?, number?, number?]>): ScoreEntryModel {
  let model = createScoreEntryModel({ matchUpFormat });
  for (const [index, [side1, side2, tiebreak1, tiebreak2]] of sets.entries()) {
    if (side1 !== undefined) model = setCell(model, G(index, 1), side1);
    if (side2 !== undefined) model = setCell(model, G(index, 2), side2);
    if (tiebreak1 !== undefined) model = setCell(model, TB(index, 1), tiebreak1);
    if (tiebreak2 !== undefined) model = setCell(model, TB(index, 2), tiebreak2);
  }
  return model;
}

const STANDARD = 'SET3-S:6/TB7';
const gateOf = (view: ScoreEntryView, extra: { openedOnRecordedOutcome?: boolean; cleared?: boolean } = {}) =>
  clearGate({ openedOnRecordedOutcome: false, cleared: false, holdsEntry: holdsEntry(view), ...extra });

describe('scoreEntryIssue names what is wrong, and where', () => {
  it('nothing is wrong with a finished score, or with nothing typed', () => {
    expect(scoreEntryIssue(typed(STANDARD, [6, 4], [6, 3]))).toBeUndefined();
    expect(scoreEntryIssue(createScoreEntryModel())).toBeUndefined();
  });

  it('a tiebreak won by the side that lost the set', () => {
    expect(scoreEntryIssue(typed(STANDARD, [7, 6, 3, 7]))).toEqual({
      code: 'TIEBREAK_CONTRADICTION',
      setIndex: 0,
      gamesWinner: 1,
    });
  });

  it('a set the factory refuses, in its own words', () => {
    const issue: any = scoreEntryIssue(typed(STANDARD, [9, 1]));
    expect(issue.code).toEqual('INVALID_SET');
    expect(issue.setIndex).toEqual(0);
    expect(typeof issue.message).toEqual('string');
  });

  it('an empty or unfinished set before the last one entered', () => {
    expect(scoreEntryIssue(typed(STANDARD, [], [6, 3]))).toEqual({ code: 'SET_HAS_NO_SCORE', setIndex: 0 });
    expect(scoreEntryIssue(typed(STANDARD, [4, 2], [6, 3]))).toEqual({ code: 'SET_NOT_FINISHED', setIndex: 0 });
  });

  it('an overtime set the scoring rules would not take', () => {
    const issue: any = scoreEntryIssue(typed('PER3XA-S:T20P-O:1SD/T5P-F:TB1', [1, 1], [0, 0], [1, 1], [1, 1]));
    expect(issue).toMatchObject({ code: 'OVERTIME_REFUSED', setIndex: 3 });
    expect(issue.message.length).toBeGreaterThan(0);
  });

  it('is silent while an ending that clears the score is chosen', () => {
    const model = chooseEnding(typed(STANDARD, [9, 1]), { kind: 'side', sideNumber: 1, status: WALKOVER });
    expect(scoreEntryIssue(model)).toBeUndefined();
    expect(discardedScore(model)).toEqual('9-1');
  });

  it('a set decided by a tiebreak with no points recorded is noted by index', () => {
    expect(unrecordedTiebreakSets(typed(STANDARD, [7, 6], [6, 3]))).toEqual([0]);
    expect(unrecordedTiebreakSets(typed(STANDARD, [7, 6, 7, 3], [6, 3]))).toEqual([]);
    const walkover = chooseEnding(typed(STANDARD, [7, 6]), { kind: 'side', sideNumber: 1, status: WALKOVER });
    expect(unrecordedTiebreakSets(walkover)).toEqual([]);
  });

  it('columns open a tiebreak cell where points are owed, and where a set is being edited', () => {
    // a 7-6 with no points is settled (the points are offered, not owed), so the next set opens beside its tiebreak
    const owed = typed(STANDARD, [7, 6]);
    expect(columns(owed)).toEqual([
      { kind: 'games', setIndex: 0 },
      { kind: 'tiebreak', setIndex: 0 },
      { kind: 'games', setIndex: 1 },
    ]);
    const recorded = typed(STANDARD, [7, 6, 7, 3]);
    expect(columns(recorded).some((slot) => slot.kind === 'tiebreak')).toEqual(false);
    expect(columns(recorded, { editingSet: 0 })).toContainEqual({ kind: 'tiebreak', setIndex: 0 });
    expect(completedSets(typed(STANDARD, [6, 4], [3, 2])).length).toEqual(1);
  });
});

describe('level closes the factory completes with no winner', () => {
  it('a combined-point total that allows a tie', () => {
    expect(isCompletedCombinedPointTie([{ side1Score: 16, side2Score: 16 }], 'SET1-S:P32')).toEqual(true);
    expect(isCompletedCombinedPointTie([{ side1Score: 17, side2Score: 15 }], 'SET1-S:P32')).toEqual(false);
    expect(isCompletedCombinedPointTie([{ side1Score: 16, side2Score: 16 }], 'SET1-S:P32DP')).toEqual(false);
    expect(isCompletedCombinedPointTie([{ side1Score: 16, side2Score: 16 }], STANDARD)).toEqual(false);

    const tied = typed('SET1-S:P32', [16, 16]);
    expect(isComplete(tied)).toEqual(true);
    expect(matchUpStatus(tied)).toEqual(COMPLETED);
    expect(winningSide(tied)).toBeUndefined();
  });

  it('an exactly or aggregate count closed level', () => {
    const halves = [
      { side1Score: 1, side2Score: 0, side1TiebreakScore: 11, side2TiebreakScore: 5 },
      { side1Score: 0, side2Score: 1, side1TiebreakScore: 5, side2TiebreakScore: 11 },
    ];
    expect(isCompletedLevelClose(halves, 'HAL2X-S:TB11')).toEqual(true);
    // a tiebreak-only set entered by its points alone is held as the segment won 1-0
    const pointsOnly = halves.map(({ side1TiebreakScore, side2TiebreakScore }) => ({
      side1TiebreakScore,
      side2TiebreakScore,
    }));
    expect(isCompletedLevelClose(pointsOnly, 'HAL2X-S:TB11')).toEqual(true);

    const level = [
      { side1Score: 3, side2Score: 3 },
      { side1Score: 2, side2Score: 2 },
    ];
    expect(isCompletedLevelClose(level, 'SET2XA-S:T10')).toEqual(true);
    expect(isCompletedLevelClose([level[0], { side1Score: 3, side2Score: 2 }], 'SET2XA-S:T10')).toEqual(false);
  });

  it('is not a tie when a set is missing, follows the close, or the format does not read', () => {
    const level = [
      { side1Score: 3, side2Score: 3 },
      { side1Score: 2, side2Score: 2 },
    ];
    expect(isCompletedLevelClose([], 'SET2XA-S:T10')).toEqual(false);
    expect(isCompletedLevelClose(level, undefined)).toEqual(false);
    expect(isCompletedLevelClose(level, 'not-a-format')).toEqual(false);
    expect(isCompletedLevelClose([...level, { side1Score: 1, side2Score: 1 }], 'SET2XA-S:T10')).toEqual(false);
    expect(isCompletedLevelClose([{ side1TiebreakScore: 3 }], 'HAL2X-S:TB11')).toEqual(false);
  });
});

describe('endings against the score', () => {
  it('Retired and Defaulted, and the endings that resolve nobody but keep the score, contradict a finished one', () => {
    expect([RETIRED, DEFAULTED, SUSPENDED, IN_PROGRESS].map(contradictsFinishedScore)).toEqual([
      true,
      true,
      true,
      true,
    ]);
    expect([WALKOVER, CANCELLED].map(contradictsFinishedScore)).toEqual([false, false]);
  });

  it('what is offered, and the code for what is not', () => {
    const empty = { model: createScoreEntryModel() };
    const finished = { model: typed(STANDARD, [6, 4], [6, 3]) };
    const partial = { model: typed(STANDARD, [6, 4], [2, 1]) };

    expect(endingOffered(RETIRED, empty)).toEqual(false);
    expect(endingRefusal(RETIRED, empty)).toEqual('ENDING_NEEDS_SCORE');
    expect(endingOffered(RETIRED, partial)).toEqual(true);
    expect(endingOffered(DEFAULTED, empty)).toEqual(true);

    expect(endingOffered(SUSPENDED, finished)).toEqual(false);
    expect(endingRefusal(SUSPENDED, finished)).toEqual('ENDING_AFTER_COMPLETE_SCORE');
    expect(endingOffered(WALKOVER, finished)).toEqual(true);

    expect(endingOffered(WALKOVER, finished, [WALKOVER])).toEqual(false);
    expect(endingRefusal(WALKOVER, finished, { disabledMatchUpStatuses: [WALKOVER] })).toEqual('STATUS_UNAVAILABLE');
  });

  it('a score that finishes retracts the ending it contradicts, on a side or for the match', () => {
    const suspended = chooseEnding(typed(STANDARD, [6, 4], [6, 3]), { kind: 'match', status: SUSPENDED });
    expect(retractEndingContradictedByScore({ model: suspended })).toEqual({ kind: 'match', status: SUSPENDED });

    const retired = chooseEnding(typed(STANDARD, [6, 4], [6, 3]), { kind: 'side', sideNumber: 2, status: RETIRED });
    expect(retractEndingContradictedByScore({ model: retired })).toEqual({
      kind: 'side',
      sideNumber: 2,
      status: RETIRED,
    });

    const unfinished = chooseEnding(typed(STANDARD, [6, 4]), { kind: 'match', status: SUSPENDED });
    expect(retractEndingContradictedByScore({ model: unfinished })).toBeUndefined();
    const walkover = chooseEnding(typed(STANDARD, [6, 4], [6, 3]), { kind: 'side', sideNumber: 2, status: WALKOVER });
    expect(retractEndingContradictedByScore({ model: walkover })).toBeUndefined();
  });

  it('an ending that carries no score locks the cells and takes the score with it', () => {
    const typedScore = typed(STANDARD, [6, 4]);
    expect(scoreLocked(typedScore)).toEqual(false);
    expect(clearScoreForEnding(typedScore)).toBeUndefined();

    const walkover = chooseEnding(typedScore, { kind: 'side', sideNumber: 1, status: WALKOVER });
    expect(scoreLocked(walkover)).toEqual(true);
    const cleared: any = clearScoreForEnding(walkover);
    expect(cleared.discarded).toEqual('6-4');
    expect(cleared.model.sets.every((set) => !Object.keys(set).length)).toEqual(true);
  });
});

describe('a reported ending, and what the view holds', () => {
  it('a status an entry approach reported applies only when nothing is selected', () => {
    const view = { model: typed(STANDARD, [6, 4], [2, 1]), reportedStatus: RETIRED };
    expect(resolutionInForce(view).matchUpStatus).toEqual(RETIRED);
    expect(scoreIsFinished({ model: typed(STANDARD, [6, 4], [6, 3]), reportedStatus: RETIRED })).toEqual(false);

    const selected = { ...view, model: chooseEnding(view.model, { kind: 'match', status: SUSPENDED }) };
    expect(resolutionInForce(selected).matchUpStatus).toEqual(SUSPENDED);
  });

  it('text a region holds counts as entry', () => {
    const empty = createScoreEntryModel();
    expect(scoreEntered({ model: empty })).toEqual(false);
    expect(scoreEntered({ model: empty, regionHasEntry: true })).toEqual(true);
    expect(holdsEntry({ model: empty })).toEqual(false);
    expect(holdsEntry({ model: chooseEnding(empty, { kind: 'reasonCode', code: 'RJ' }) })).toEqual(true);
  });

  it('the scope refusal comes before the score issue', () => {
    const view = { model: chooseEnding(typed(STANDARD, [9, 1]), { kind: 'match', status: SUSPENDED }) };
    expect(scoreEntryProblem(view, { disabledMatchUpStatuses: [SUSPENDED] })).toEqual({
      code: 'STATUS_UNAVAILABLE',
      matchUpStatus: SUSPENDED,
    });
    expect(scoreEntryProblem(view)).toMatchObject({ code: 'INVALID_SET', setIndex: 0 });
  });
});

describe('Clear and Submit', () => {
  it('a clear needs [Clear] pressed, a recorded outcome, and an empty card; a refused one says so', () => {
    expect(clearGate({ openedOnRecordedOutcome: true, cleared: true, holdsEntry: false })).toEqual({
      removalRefused: false,
      refusedNow: false,
      submitsAClear: true,
    });
    expect(clearGate({ openedOnRecordedOutcome: false, cleared: true, holdsEntry: false }).submitsAClear).toEqual(
      false,
    );
    expect(clearGate({ openedOnRecordedOutcome: true, cleared: true, holdsEntry: true }).submitsAClear).toEqual(false);

    const refused = clearGate({ openedOnRecordedOutcome: true, cleared: true, holdsEntry: false, clearable: false });
    expect(refused).toEqual({ removalRefused: true, refusedNow: true, submitsAClear: false });
    expect(clearHeadline(refused)).toEqual('clearRefused');
    expect(clearHeadline(clearGate({ openedOnRecordedOutcome: true, cleared: true, holdsEntry: false }))).toEqual(
      'clearedHeadline',
    );
    expect(clearHeadline(gateOf({ model: createScoreEntryModel() }))).toBeUndefined();
  });

  it('Submit is live for a finished score or a resolved ending, and never over a problem', () => {
    const finished = { model: typed(STANDARD, [6, 4], [6, 3]) };
    expect(footerState(finished, gateOf(finished))).toEqual({
      submitDisabled: false,
      submitRefusedNow: false,
      clearDisabled: false,
    });

    const partial = { model: typed(STANDARD, [6, 4]) };
    expect(footerState(partial, gateOf(partial)).submitDisabled).toEqual(true);

    const walkover = {
      model: chooseEnding(createScoreEntryModel(), { kind: 'side', sideNumber: 1, status: WALKOVER }),
    };
    expect(footerState(walkover, gateOf(walkover)).submitDisabled).toEqual(false);
    expect(footerState(walkover, gateOf(walkover), { disabledMatchUpStatuses: [WALKOVER] }).submitDisabled).toEqual(
      true,
    );

    const awaiting = { model: chooseEnding(createScoreEntryModel(), { kind: 'side', sideNumber: 1, status: RETIRED }) };
    expect(footerState(awaiting, gateOf(awaiting)).submitDisabled).toEqual(false);

    const empty = { model: createScoreEntryModel() };
    expect(footerState(empty, gateOf(empty))).toEqual({
      submitDisabled: true,
      submitRefusedNow: false,
      clearDisabled: true,
    });
  });

  it('what Submit sends', () => {
    const finished = { model: typed(STANDARD, [6, 4], [6, 3]) };
    expect(submission(finished, gateOf(finished))).toEqual({
      matchUpStatus: undefined,
      winningSide: 1,
      reasonCode: undefined,
      score: '6-4 6-3',
    });

    const double = chooseEnding(
      chooseEnding(createScoreEntryModel(), { kind: 'side', sideNumber: 1, status: DEFAULTED }),
      { kind: 'bothSidesOut' },
    );
    expect(submission({ model: double }, gateOf({ model: double }))).toMatchObject({
      matchUpStatus: DOUBLE_DEFAULT,
      winningSide: undefined,
    });

    const empty = { model: createScoreEntryModel() };
    expect(submission(empty, gateOf(empty, { openedOnRecordedOutcome: true, cleared: true }))).toEqual({
      cleared: true,
    });
    const refused = clearGate({ openedOnRecordedOutcome: true, cleared: true, holdsEntry: false, clearable: false });
    expect(submission(empty, refused)).toBeUndefined();

    const walkover = {
      model: chooseEnding(typed(STANDARD, [6, 4]), { kind: 'side', sideNumber: 2, status: WALKOVER }),
    };
    expect(submission(walkover, gateOf(walkover))).toEqual({
      matchUpStatus: WALKOVER,
      winningSide: 1,
      reasonCode: undefined,
      score: undefined,
    });
    expect(submission(walkover, gateOf(walkover), { disabledMatchUpStatuses: [WALKOVER] })).toBeUndefined();
  });
});

describe('reason codes on a recorded matchUp', () => {
  it('a double exit reads its codes from its base ending', () => {
    expect(groupKeyForStatus(DOUBLE_WALKOVER)).toEqual(WALKOVER);
    expect(groupKeyForStatus(DOUBLE_DEFAULT)).toEqual(DEFAULTED);
    expect(groupKeyForStatus(RETIRED)).toEqual(RETIRED);
    expect(groupKeyForStatus(undefined)).toBeUndefined();
  });

  it('the reason is read from the side that did not win, the match, then the legacy first element', () => {
    expect(recordedStatusCode({ matchUpStatus: RETIRED, winningSide: 1, sideStatusCodes: { 2: 'RJ' } })).toEqual('RJ');
    expect(recordedStatusCode({ matchUpStatus: DOUBLE_WALKOVER, sideStatusCodes: { 1: 'W1' } })).toEqual('W1');
    expect(recordedStatusCode({ matchUpStatus: SUSPENDED, matchUpStatusCode: 'RAIN' })).toEqual('RAIN');
    expect(
      recordedStatusCode({ matchUpStatus: RETIRED, winningSide: 2, matchUpStatusCodes: [{ code: 'RJ' }] }),
    ).toEqual('RJ');
    expect(recordedStatusCode({ matchUpStatus: RETIRED, matchUpStatusCodes: [''] })).toBeUndefined();
    expect(recordedStatusCode(undefined)).toBeUndefined();
  });

  it('three element shapes are codes, a provenance element is not', () => {
    expect(normalizeStatusCode('RJ')).toEqual('RJ');
    expect(normalizeStatusCode({ matchUpStatusCode: 'RJ' })).toEqual('RJ');
    expect(normalizeStatusCode({ code: 'RJ' })).toEqual('RJ');
    expect(normalizeStatusCode({ sourceMatchUpId: 'm1' })).toBeUndefined();
    expect(normalizeStatusCode('')).toBeUndefined();
    expect(normalizeStatusCode(7)).toBeUndefined();
  });

  it('a policy offers codes for a status, drops an entry with no code, and offers none for an unknown group', () => {
    const groups: any = {
      [WALKOVER]: [{ matchUpStatusCode: 'W1', matchUpStatusCodeDisplay: 'Wo [inj]' }, { label: 'blank' }],
      [RETIRED]: 'not a list',
    };
    expect(codesForStatus(groups, DOUBLE_WALKOVER)).toEqual([
      { matchUpStatusCode: 'W1', matchUpStatusCodeDisplay: 'Wo [inj]' },
    ]);
    expect(codesForStatus(groups, RETIRED)).toEqual([]);
    expect(codesForStatus(undefined, WALKOVER)).toEqual([]);
    expect(codesForStatus(groups, undefined)).toEqual([]);
  });
});
