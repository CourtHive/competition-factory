/**
 * A score state, submitted, is what the factory's `setMatchUpStatus` records.
 *
 * Each case drives a score state the way an operator does (typed cells, a chosen ending, a reopened result), takes what
 * the rules say Submit sends (`submission`), converts it (`toEngineOutcome`) and hands it to the authoritative
 * `setMatchUpStatus`. The stored matchUp must say what the score state said: the status, the winner, the score line the
 * score state showed, the positional reason, and for a clear, nothing at all.
 */
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { describe, expect, it } from 'vitest';
import {
  createScoreEntryModel,
  toEngineOutcome,
  chooseEnding,
  changeFormat,
  enteredSets,
  scoreString,
  submission,
  holdsEntry,
  clearGate,
  clearAll,
  setCell,
} from '../../scoreEntryState';

// constants and types
import type { CellRef, ClearGateInput, ScoreEntryModel } from '../../scoreEntryState';
import { matchUpStatusConstants } from '@Constants/index';

const { COMPLETED, RETIRED, WALKOVER, DOUBLE_WALKOVER, DEFAULTED, TO_BE_PLAYED, SUSPENDED } = matchUpStatusConstants;

const G = (setIndex: number, side: 1 | 2): CellRef => ({ setIndex, side, kind: 'games' });
const TB = (setIndex: number, side: 1 | 2): CellRef => ({ setIndex, side, kind: 'tiebreak' });

/** A fresh draw and one first-round matchUp with both participants. */
function scoringTarget(matchUpFormat = 'SET3-S:6/TB7') {
  mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 4, matchUpFormat }], setState: true });
  const matchUp = tournamentEngine
    .allTournamentMatchUps({ matchUpFilters: { roundNumbers: [1] } })
    .matchUps.find((candidate) => candidate.sides?.every((side) => side.participantId));
  return { drawId: matchUp.drawId, matchUpId: matchUp.matchUpId };
}

function stored(matchUpId: string) {
  return tournamentEngine.findMatchUp({ matchUpId, inContext: true }).matchUp;
}

/** Typed games (and tiebreak points), set by set, as cells. */
function typed(model: ScoreEntryModel, ...sets: Array<[number, number, number?, number?]>): ScoreEntryModel {
  let next = model;
  for (const [index, [side1, side2, tiebreak1, tiebreak2]] of sets.entries()) {
    next = setCell(setCell(next, G(index, 1), side1), G(index, 2), side2);
    if (tiebreak1 !== undefined) next = setCell(next, TB(index, 1), tiebreak1);
    if (tiebreak2 !== undefined) next = setCell(next, TB(index, 2), tiebreak2);
  }
  return next;
}

/** What Submit sends for a score state, through the score state's own rules, as the engine's outcome. */
function submitted(model: ScoreEntryModel, gate: Partial<ClearGateInput> = {}, changedFormat?: string) {
  const view = { model };
  const reported = submission(
    view,
    clearGate({ openedOnRecordedOutcome: false, cleared: false, holdsEntry: holdsEntry(view), ...gate }),
  );
  expect(reported).toBeDefined();
  return toEngineOutcome({ ...reported, sets: enteredSets(model) }, changedFormat);
}

function apply(target: { drawId: string; matchUpId: string }, outcome: object) {
  let result: any = tournamentEngine.setMatchUpStatus({ ...target, outcome });
  expect(result.success).toEqual(true);
  result = stored(target.matchUpId);
  return result;
}

describe('a submitted score state is what setMatchUpStatus records', () => {
  it('a completed score: COMPLETED, the winner, and the line the score state showed', () => {
    const target = scoringTarget();
    const model = typed(createScoreEntryModel({ matchUpFormat: 'SET3-S:6/TB7' }), [6, 4], [6, 3]);
    const matchUp = apply(target, submitted(model));

    expect(matchUp.matchUpStatus).toEqual(COMPLETED);
    expect(matchUp.winningSide).toEqual(1);
    expect(matchUp.score.scoreStringSide1).toEqual(scoreString(model));
    expect(scoreString(model)).toEqual('6-4 6-3');
  });

  it('a set won on a tiebreak, and a match-tiebreak decider', () => {
    let target = scoringTarget();
    let model = typed(createScoreEntryModel({ matchUpFormat: 'SET3-S:6/TB7' }), [6, 7, 3, 7], [6, 4], [7, 6, 7, 5]);
    let matchUp = apply(target, submitted(model));
    expect(matchUp.winningSide).toEqual(1);
    expect(matchUp.score.scoreStringSide1).toEqual('6-7(3) 6-4 7-6(5)');
    expect(scoreString(model)).toEqual(matchUp.score.scoreStringSide1);

    target = scoringTarget('SET3-S:6/TB7-F:TB10');
    model = typed(createScoreEntryModel({ matchUpFormat: 'SET3-S:6/TB7-F:TB10' }), [6, 4], [4, 6], [8, 10]);
    matchUp = apply(target, submitted(model));
    expect(matchUp.matchUpStatus).toEqual(COMPLETED);
    expect(matchUp.winningSide).toEqual(2);
    expect(matchUp.score.scoreStringSide2).toEqual('4-6 6-4 [10-8]');
    expect(scoreString(model)).toEqual('6-4 4-6 [8-10]');
  });

  it('a retirement keeps its part-score and the reason, on the side that retired', () => {
    const target = scoringTarget();
    let model = typed(createScoreEntryModel(), [6, 4], [2, 1]);
    model = chooseEnding(model, { kind: 'side', sideNumber: 2, status: RETIRED });
    model = chooseEnding(model, { kind: 'reasonCode', code: 'RJ' });

    const outcome = submitted(model);
    expect(outcome.matchUpStatusCodes).toEqual(['', 'RJ']);
    const matchUp = apply(target, outcome);

    expect(matchUp.matchUpStatus).toEqual(RETIRED);
    expect(matchUp.winningSide).toEqual(1);
    expect(matchUp.score.scoreStringSide1).toEqual('6-4 2-1');
  });

  it('a reopened result hydrates the same score state, and resubmitting it changes nothing', () => {
    const target = scoringTarget();
    let model = typed(createScoreEntryModel(), [3, 6]);
    model = chooseEnding(model, { kind: 'side', sideNumber: 1, status: DEFAULTED });
    model = chooseEnding(model, { kind: 'reasonCode', code: 'DQ' });
    const first = apply(target, submitted(model));
    expect(first.matchUpStatus).toEqual(DEFAULTED);
    expect(first.winningSide).toEqual(2);

    const reopened = createScoreEntryModel({
      matchUpFormat: first.matchUpFormat,
      sets: first.score.sets,
      matchUp: first,
    });
    expect(reopened.ending).toEqual({ sideEnding: { sideNumber: 1, status: DEFAULTED }, reasonCode: 'DQ' });
    expect(scoreString(reopened)).toEqual(scoreString(model));

    const second = apply(target, submitted(reopened, { openedOnRecordedOutcome: true }));
    for (const field of ['matchUpStatus', 'winningSide', 'matchUpStatusCodes', 'score'])
      expect(second[field]).toEqual(first[field]);
  });

  it('a walkover clears the typed score; neither appearing is a double walkover with no winner', () => {
    let target = scoringTarget();
    let model = typed(createScoreEntryModel(), [6, 4]);
    model = chooseEnding(model, { kind: 'side', sideNumber: 1, status: WALKOVER });
    let matchUp = apply(target, submitted(model));
    expect(matchUp.matchUpStatus).toEqual(WALKOVER);
    expect(matchUp.winningSide).toEqual(2);
    expect(matchUp.score?.sets ?? []).toEqual([]);

    target = scoringTarget();
    model = chooseEnding(createScoreEntryModel(), { kind: 'side', sideNumber: 1, status: WALKOVER });
    model = chooseEnding(model, { kind: 'bothSidesOut' });
    const outcome = submitted(model);
    expect(outcome.matchUpStatus).toEqual(DOUBLE_WALKOVER);
    matchUp = apply(target, outcome);
    expect(matchUp.matchUpStatus).toEqual(DOUBLE_WALKOVER);
    expect(matchUp.winningSide).toBeUndefined();
  });

  it('a suspension keeps the part-score and names no winner', () => {
    const target = scoringTarget();
    let model = typed(createScoreEntryModel(), [6, 4], [3, 2]);
    model = chooseEnding(model, { kind: 'match', status: SUSPENDED });
    const matchUp = apply(target, submitted(model));
    expect(matchUp.matchUpStatus).toEqual(SUSPENDED);
    expect(matchUp.winningSide).toBeUndefined();
    expect(matchUp.score.scoreStringSide1).toEqual('6-4 3-2');
  });

  it('a clear removes the score AND the codes', () => {
    const target = scoringTarget();
    let model = typed(createScoreEntryModel(), [6, 4], [2, 1]);
    model = chooseEnding(model, { kind: 'side', sideNumber: 2, status: RETIRED });
    model = chooseEnding(model, { kind: 'reasonCode', code: 'RJ' });
    const recorded = apply(target, submitted(model));
    expect(recorded.matchUpStatusCodes?.length).toBeGreaterThan(0);

    const reopened = createScoreEntryModel({ sets: recorded.score.sets, matchUp: recorded });
    const cleared = clearAll(reopened);
    const outcome = submitted(cleared, { openedOnRecordedOutcome: true, cleared: true });
    expect(outcome).toEqual({ score: { sets: [] }, matchUpStatusCodes: [] });

    const matchUp = apply(target, outcome);
    expect(matchUp.matchUpStatus).toEqual(TO_BE_PLAYED);
    expect(matchUp.winningSide).toBeUndefined();
    expect(matchUp.score?.sets ?? []).toEqual([]);
    expect(matchUp.matchUpStatusCodes ?? []).toEqual([]);
  });

  it('a format changed in the score state rides along and is persisted with the result', () => {
    const target = scoringTarget();
    let model = changeFormat(createScoreEntryModel(), 'SET1-S:6/TB7');
    model = typed(model, [6, 2]);
    const matchUp = apply(target, submitted(model, {}, 'SET1-S:6/TB7'));
    expect(matchUp.matchUpFormat).toEqual('SET1-S:6/TB7');
    expect(matchUp.winningSide).toEqual(1);
  });

  it('an overtime result decided in the shootout', () => {
    const matchUpFormat = 'HAL2XA-S:T45P-O:2X/T15P-F:SO5';
    const target = scoringTarget(matchUpFormat);
    const model = typed(createScoreEntryModel({ matchUpFormat }), [1, 1], [0, 0], [1, 1], [0, 0], [5, 4]);
    const outcome = submitted(model);
    expect(outcome.winningSide).toEqual(1);
    const matchUp = apply(target, outcome);
    expect(matchUp.matchUpStatus).toEqual(COMPLETED);
    expect(matchUp.winningSide).toEqual(1);
  });

  it('a status out of the host scope submits nothing', () => {
    const model = chooseEnding(createScoreEntryModel(), { kind: 'side', sideNumber: 1, status: WALKOVER });
    const view = { model };
    const gate = clearGate({ openedOnRecordedOutcome: false, cleared: false, holdsEntry: holdsEntry(view) });
    expect(submission(view, gate, { disabledMatchUpStatuses: [WALKOVER] })).toBeUndefined();
    expect(submission(view, gate, { disabledMatchUpStatuses: [] })).toMatchObject({ matchUpStatus: WALKOVER });
  });
});
