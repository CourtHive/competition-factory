import { generateOutcomeFromScoreString } from '@Scoring/parse/outcomeFromScoreString';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { describe, expect, it } from 'vitest';

// constants
import { CANNOT_CHANGE_WINNING_SIDE, INVALID_MATCHUP_STATUS } from '@Constants/errorConditionConstants';
import { FIRST_MATCH_LOSER_CONSOLATION } from '@Constants/drawDefinitionConstants';
import { DOMINANT_DUO } from '@Constants/tieFormatConstants';
import { TEAM } from '@Constants/eventConstants';
import {
  COMPLETED,
  DEFAULTED,
  DOUBLE_DEFAULT,
  DOUBLE_WALKOVER,
  RETIRED,
  TO_BE_PLAYED,
  WALKOVER,
} from '@Constants/matchUpStatusConstants';

/**
 * WHAT A TEAM CALL LEAVES IN THE RECORD, stated of the record alone. Each case is played through the engine under
 * whichever outcome pipeline the run is given and asserts the stored draw: no pipeline is named, compared or
 * switched, so the behaviour holds for any implementation of `setMatchUpStatus`.
 *
 *  - a line's double exit produces nothing, and leaving it changes nothing beyond the line and its dual;
 *  - a refused call leaves the record exactly as it was, a TEAM dual's included;
 *  - a decided dual's exit carried on by a call that turns auto-calc on, where its lines project no winner, is refused
 *    (CA, 2026-11-18), while a dual scored by hand keeps the winner the call names;
 *  - a dual decided by its own call stays directed as its lines are played: its winner stands in the next dual, and a
 *    winner its lines hand to the other side replaces the first there.
 */
const DRAW_ID = 'd';
const CLEARED = { matchUpStatus: TO_BE_PLAYED, score: { scoreStringSide1: '', scoreStringSide2: '' } };
const won = (winningSide: number) => generateOutcomeFromScoreString({ scoreString: '6-1 6-1', winningSide }).outcome;

function generate(drawProfile: Record<string, unknown> = { drawSize: 4 }) {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ eventType: TEAM, tieFormatName: DOMINANT_DUO, ...drawProfile, drawId: DRAW_ID }],
    setState: true,
    nonRandom: 1,
  });
  let result: any = tournamentEngine.generateLineUps({ useDefaultEventRanking: true, attach: true, drawId: DRAW_ID });
  expect(result.success).toEqual(true);
}

const dual = (roundNumber: number, roundPosition: number, structureName = 'Main'): any =>
  tournamentEngine
    .allDrawMatchUps({ drawId: DRAW_ID, inContext: true })
    .matchUps.find(
      (matchUp: any) =>
        !matchUp.collectionId &&
        matchUp.structureName === structureName &&
        matchUp.roundNumber === roundNumber &&
        matchUp.roundPosition === roundPosition,
    );

const set = (matchUpId: string, outcome: Record<string, unknown>, params: Record<string, unknown> = {}): any =>
  tournamentEngine.setMatchUpStatus({ drawId: DRAW_ID, matchUpId, outcome, ...params });
const enter = (matchUpId: string, outcome: Record<string, unknown>, params: Record<string, unknown> = {}) =>
  expect(set(matchUpId, outcome, params).success, JSON.stringify(outcome)).toEqual(true);

/** the stored record, as text: every value and every stamp */
const record = () => JSON.stringify(tournamentEngine.getTournament().tournamentRecord);
/** a stored matchUp, a dual or one of its lines */
function stored(matchUpId: string): any {
  let found: any;
  const visit = (value: any) => {
    if (!value || typeof value !== 'object' || found) return;
    if (value.matchUpId === matchUpId) found = value;
    else Object.values(value).forEach(visit);
  };
  visit(JSON.parse(record()).events);
  return found;
}

describe("a line's double exit produces nothing, and leaving it changes nothing beyond the line and its dual", () => {
  it.each([
    ['cleared', { matchUpStatus: TO_BE_PLAYED }, TO_BE_PLAYED],
    ['cleared with an empty score', CLEARED, TO_BE_PLAYED],
    ['given a result', won(1), COMPLETED],
    ['entered as the other double exit', { matchUpStatus: DOUBLE_WALKOVER }, DOUBLE_WALKOVER],
  ])('%s', (_label, outcome, matchUpStatus) => {
    generate();
    const first = dual(1, 1);
    const lineId = first.tieMatchUps[1].matchUpId;
    const others = () =>
      [dual(1, 2).matchUpId, dual(2, 1).matchUpId].map((matchUpId) => JSON.stringify(stored(matchUpId)));

    const untouched = others();
    enter(lineId, { matchUpStatus: DOUBLE_DEFAULT });
    // entering it sends nobody on and writes nothing elsewhere
    expect(others()).toEqual(untouched);
    expect(stored(first.matchUpId).winningSide).toBeUndefined();

    enter(lineId, outcome);
    expect(stored(lineId).matchUpStatus).toEqual(matchUpStatus);
    // the next dual, which nobody has reached, and the other first-round dual: every value and stamp as they were
    expect(others()).toEqual(untouched);
  });
});

describe('a refused TEAM dual call leaves the record as it was', () => {
  it.each([
    ['decided by its own call', (first: any) => [[first.matchUpId, { winningSide: 2 }]]],
    ['decided by its lines', (first: any) => [0, 1].map((at) => [first.tieMatchUps[at].matchUpId, { winningSide: 2 }])],
  ])('a dual %s whose winner has played on, given the other winner', (_label, decide) => {
    generate();
    const first = dual(1, 1);
    for (const [matchUpId, outcome] of decide(first) as [string, Record<string, unknown>][]) enter(matchUpId, outcome);
    enter(dual(1, 2).matchUpId, { winningSide: 1 });
    enter(dual(2, 1).matchUpId, { winningSide: 1 });

    const before = record();
    let result: any = set(first.matchUpId, { winningSide: 1 });
    expect(result.error?.code).toEqual(CANNOT_CHANGE_WINNING_SIDE.code);
    expect(record()).toEqual(before);
  });
});

describe('a decided dual given an exit that carries, by a call that turns auto-calc on', () => {
  const exit = { matchUpStatus: DEFAULTED, winningSide: 2 };

  it('is refused where its lines project no winner, and nothing is written', () => {
    generate();
    const first = dual(1, 1);
    enter(first.matchUpId, { winningSide: 1 });
    const before = record();
    let result: any = set(first.matchUpId, exit, { enableAutoCalc: true, propagateExitStatus: true });
    expect(result.error?.code).toEqual(INVALID_MATCHUP_STATUS.code);
    expect(result.info).toEqual('matchUpStatus: DEFAULTED');
    expect(record()).toEqual(before);
    // the dual is still decided, its winner still in the next dual
    expect(stored(first.matchUpId).winningSide).toEqual(1);
    expect(stored(first.winnerMatchUpId).drawPositions.filter(Boolean)).toEqual([first.drawPositions[0]]);
  });

  it('is refused on a dual flagged as scored by hand too: the call turns its auto-calc on', () => {
    generate();
    const first = dual(1, 1);
    enter(first.matchUpId, { winningSide: 1 }, { disableAutoCalc: true });
    const before = record();
    let result: any = set(first.matchUpId, exit, { enableAutoCalc: true, propagateExitStatus: true });
    expect(result.error?.code).toEqual(INVALID_MATCHUP_STATUS.code);
    expect(record()).toEqual(before);
  });

  it('is accepted where its lines project the winner the exit names', () => {
    generate();
    const first = dual(1, 1);
    for (const at of [0, 1]) enter(first.tieMatchUps[at].matchUpId, { winningSide: 2 });
    enter(first.matchUpId, exit, { enableAutoCalc: true, propagateExitStatus: true });
    const held = stored(first.matchUpId);
    expect([held.matchUpStatus, held.winningSide]).toEqual([DEFAULTED, 2]);
  });

  // THE MANUAL OVERRIDE, in both readings: the call itself disables auto-calc, or names neither flag on a dual already
  // flagged as scored by hand. Neither is projected from the lines: the exit keeps the winner the call names
  it.each([
    ['the call disables auto-calc', {}, { disableAutoCalc: true, propagateExitStatus: true }],
    ['the dual is already scored by hand', { disableAutoCalc: true }, { propagateExitStatus: true }],
  ])('scored by hand (%s), the exit is written with the winner it names', (_label, decidedWith, params) => {
    generate();
    const first = dual(1, 1);
    enter(first.matchUpId, { winningSide: 1 }, decidedWith);
    enter(first.matchUpId, exit, params);
    const held = stored(first.matchUpId);
    expect([held.matchUpStatus, held.winningSide, held.disableAutoCalc]).toEqual([DEFAULTED, 2, true]);
    expect(stored(first.winnerMatchUpId).drawPositions.filter(Boolean)).toEqual([first.drawPositions[1]]);
  });
});

describe('a dual decided by its own call stays directed as its lines are played', () => {
  it('a line corrected to the winner the dual was given: winner and loser stand where they were sent', () => {
    generate({ drawSize: 8, drawType: FIRST_MATCH_LOSER_CONSOLATION });
    const first = dual(1, 3);
    const [doubles, singles] = first.tieMatchUps.map((tieMatchUp: any) => tieMatchUp.matchUpId);
    enter(doubles, { winningSide: 1 });
    enter(singles, won(2));
    const retired = generateOutcomeFromScoreString({ scoreString: '6-1 2-1', winningSide: 1 }).outcome;
    enter(first.matchUpId, { ...retired, matchUpStatus: RETIRED });
    const sent = () => [
      stored(first.winnerMatchUpId).drawPositions.filter(Boolean),
      JSON.parse(record())
        .events[0].drawDefinitions[0].structures[1].positionAssignments.map(
          (assignment: any) => assignment.participantId,
        )
        .filter(Boolean),
    ];
    const before = sent();
    expect(before.map((held) => held.length)).toEqual([1, 1]);

    enter(singles, won(1));
    const held = stored(first.matchUpId);
    expect([held.matchUpStatus, held.winningSide, held.score.scoreStringSide1]).toEqual([COMPLETED, 1, '2-0']);
    expect(sent()).toEqual(before);
  });

  it.each([
    ['the next dual full', true],
    ['the next dual holding the first winner alone', false],
  ])('a fresh line hands the dual to the other side, %s: the new winner replaces the first', (_label, full) => {
    generate();
    const first = dual(1, 1);
    enter(first.tieMatchUps[2].matchUpId, won(2));
    enter(first.matchUpId, { winningSide: 1 });
    if (full) enter(dual(1, 2).matchUpId, { winningSide: 2 });
    expect(stored(first.winnerMatchUpId).drawPositions.filter(Boolean)).toContain(first.drawPositions[0]);

    enter(first.tieMatchUps[0].matchUpId, { matchUpStatus: WALKOVER, winningSide: 2 });
    const held = stored(first.matchUpId);
    expect([held.matchUpStatus, held.winningSide]).toEqual([COMPLETED, 2]);
    expect(stored(first.winnerMatchUpId).drawPositions.filter(Boolean)).toEqual(
      full ? [first.drawPositions[1], 4] : [first.drawPositions[1]],
    );
  });
});

describe('a dual tallied by games: a line whose winner is named with no score keeps the score it holds', () => {
  // the dual's winner is the side with more games across its lines (`aggregateValue`)
  const tieFormat = {
    winCriteria: { aggregateValue: true },
    collectionDefinitions: [
      { collectionId: 'doubles', collectionName: 'Doubles', matchUpType: 'DOUBLES', matchUpCount: 1, scoreValue: 1 },
      { collectionId: 'singles', collectionName: 'Singles', matchUpType: 'SINGLES', matchUpCount: 2, scoreValue: 1 },
    ].map((collection) => ({ ...collection, matchUpFormat: 'SET1-S:6/TB7' })),
  };
  const games = (winningSide: number, scoreString: string) =>
    generateOutcomeFromScoreString({ scoreString, winningSide, matchUpFormat: 'SET1-S:6/TB7' }).outcome;

  it.each([
    ['the same winner', 2],
    ['the other winner', 1],
  ])(
    '%s named alone on a line of a decided dual: the dual keeps its score, its winner and where it sent them',
    (_label, winningSide) => {
      generate({ drawSize: 4, tieFormat, tieFormatName: undefined });
      const first = dual(1, 1);
      const [doubles, singles1, singles2] = first.tieMatchUps.map((tieMatchUp: any) => tieMatchUp.matchUpId);
      enter(doubles, games(2, '6-3'));
      enter(singles1, games(1, '6-1'));
      enter(singles2, games(2, '6-1'));
      // 3 + 6 + 1 games against 6 + 1 + 6
      const decided = stored(first.matchUpId);
      expect([decided.winningSide, decided.score.scoreStringSide1]).toEqual([2, '10-13']);
      const sent = stored(first.winnerMatchUpId).drawPositions.filter(Boolean);
      expect(sent).toEqual([first.drawPositions[1]]);

      enter(doubles, { winningSide });
      const line = stored(doubles);
      expect([line.winningSide, line.score.scoreStringSide1]).toEqual([winningSide, '3-6']);
      const held = stored(first.matchUpId);
      expect([held.matchUpStatus, held.winningSide, held.score.scoreStringSide1]).toEqual([COMPLETED, 2, '10-13']);
      expect(stored(first.winnerMatchUpId).drawPositions.filter(Boolean)).toEqual(sent);
    },
  );
});
