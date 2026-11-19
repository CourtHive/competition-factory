import { generateOutcomeFromScoreString } from '@Scoring/parse/outcomeFromScoreString';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { afterEach, describe, expect, it } from 'vitest';

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

describe('a dual given an exit with a winner by a call that turns auto-calc on, its lines projecting no winner', () => {
  const exit = { matchUpStatus: DEFAULTED, winningSide: 2 };

  // CA, 2026-11-19: refused whether the dual is decided or not, and whether the exit carries or not
  it.each([
    ['a fresh dual, the exit carried', false, { enableAutoCalc: true, propagateExitStatus: true }],
    ['a fresh dual, the exit not carried', false, { enableAutoCalc: true }],
    ['a decided dual, the exit not carried', true, { enableAutoCalc: true }],
    ['a decided dual, the exit carried', true, { enableAutoCalc: true, propagateExitStatus: true }],
  ])('%s: refused, and nothing is written', (_label, decided, params) => {
    generate();
    const first = dual(1, 1);
    if (decided) enter(first.matchUpId, { winningSide: 1 });
    const before = record();
    let result: any = set(first.matchUpId, exit, params);
    expect(result.error?.code).toEqual(INVALID_MATCHUP_STATUS.code);
    expect(result.info).toEqual('matchUpStatus: DEFAULTED');
    expect(record()).toEqual(before);
  });

  // the lines decide a dual whose auto-calc is on: where they project a winner the exit is written with that winner,
  // whichever winner the call names
  it.each([
    ['the winner the call names', 2],
    ['the other winner', 1],
  ])('accepted where the lines project %s, and written with the projected winner', (_label, projected) => {
    generate();
    const first = dual(1, 1);
    for (const at of [0, 1]) enter(first.tieMatchUps[at].matchUpId, { winningSide: projected });
    enter(first.matchUpId, exit, { enableAutoCalc: true });
    const held = stored(first.matchUpId);
    expect([held.matchUpStatus, held.winningSide]).toEqual([DEFAULTED, projected]);
    expect(stored(first.winnerMatchUpId).drawPositions.filter(Boolean)).toEqual([first.drawPositions[projected - 1]]);
  });

  // the manual override on a fresh dual: not projected, the exit keeps the winner the call names
  it.each([
    ['the call disables auto-calc', { disableAutoCalc: true, propagateExitStatus: true }],
    ['the call names neither flag', { propagateExitStatus: true }],
  ])('a fresh dual scored by hand (%s): the exit is written with the winner it names', (_label, params) => {
    generate();
    const first = dual(1, 1);
    enter(first.matchUpId, exit, params);
    const held = stored(first.matchUpId);
    expect([held.matchUpStatus, held.winningSide]).toEqual([DEFAULTED, 2]);
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

describe('a dual scored by hand keeps its double exit, and the exit it produced, as its lines are played', () => {
  it.each([
    ['a line given a winner', { winningSide: 2 }],
    ['a line given an exit', { matchUpStatus: WALKOVER, winningSide: 1 }],
  ])('%s: the next dual keeps its produced walkover, and the team arriving there takes it', (_label, outcome) => {
    generate({ drawSize: 8 });
    const exited = dual(1, 3);
    enter(exited.matchUpId, { matchUpStatus: DOUBLE_WALKOVER }, { disableAutoCalc: true });
    const produced = () => stored(exited.winnerMatchUpId);
    expect(produced().matchUpStatus).toEqual(WALKOVER);
    const provenance = produced().sideExitProvenance;
    expect(provenance).toBeDefined();

    enter(exited.tieMatchUps[0].matchUpId, outcome);
    expect(stored(exited.matchUpId).matchUpStatus).toEqual(DOUBLE_WALKOVER);
    expect([produced().matchUpStatus, produced().sideExitProvenance]).toEqual([WALKOVER, provenance]);
    const final = dual(3, 1);
    expect(stored(final.matchUpId).drawPositions.filter(Boolean)).toEqual([]);

    // the other feeder's winner arrives at the produced walkover, wins it and goes on to the final
    const feeder = dual(1, 4);
    enter(feeder.matchUpId, { winningSide: 2 });
    const arrived = feeder.drawPositions[1];
    const next = stored(exited.winnerMatchUpId);
    expect([next.matchUpStatus, next.drawPositions.filter(Boolean)]).toEqual([WALKOVER, [arrived]]);
    expect(next.winningSide).toBeDefined();
    expect(stored(final.matchUpId).drawPositions.filter(Boolean)).toEqual([arrived]);
  });
});

describe('a line entered again, its own winner unchanged, that hands a played-on dual to the other side is refused', () => {
  // the dual's lines tally 2-1 to side 1; the dual is then decided for side 2 by its own call, and side 2 sent on
  function decidedAgainstItsLines(playedOn: boolean) {
    generate();
    const first = dual(1, 1);
    const [doubles, singles1, singles2] = first.tieMatchUps.map((tieMatchUp: any) => tieMatchUp.matchUpId);
    enter(doubles, { winningSide: 1 });
    enter(singles1, { matchUpStatus: WALKOVER, winningSide: 1 });
    enter(singles2, won(2));
    expect(stored(first.matchUpId).winningSide).toEqual(1);
    enter(first.matchUpId, { matchUpStatus: WALKOVER, winningSide: 2 });
    enter(dual(1, 2).matchUpId, { winningSide: 2 });
    const final = dual(2, 1);
    if (playedOn) enter(final.tieMatchUps[0].matchUpId, { matchUpStatus: DOUBLE_WALKOVER });
    expect(stored(final.matchUpId).drawPositions).toContain(first.drawPositions[1]);
    return { first, final, singles2 };
  }

  it.each([
    ['its result entered again', won(2)],
    ['relabelled an exit', { matchUpStatus: WALKOVER, winningSide: 2 }],
  ])('%s: CANNOT_CHANGE_WINNING_SIDE, and the record is unchanged', (_label, outcome) => {
    const { singles2 } = decidedAgainstItsLines(true);
    const before = record();
    const result = set(singles2, outcome);
    expect(result.error).toEqual(CANNOT_CHANGE_WINNING_SIDE);
    expect(record()).toEqual(before);
  });

  it('with the next dual not yet played on, the line hands the dual to side 1, who replaces side 2 there', () => {
    const { first, final, singles2 } = decidedAgainstItsLines(false);
    enter(singles2, won(2));
    expect(stored(first.matchUpId).winningSide).toEqual(1);
    const held = stored(final.matchUpId).drawPositions.filter(Boolean);
    expect(held).toContain(first.drawPositions[0]);
    expect(held).not.toContain(first.drawPositions[1]);
  });
});

describe('a line deciding its dual into a BYE: the next dual is announced after the matchUp the BYE passes the team on to', () => {
  afterEach(() => setSubscriptions({ subscriptions: {} }));

  it('the consolation dual beyond is announced first, then the BYE dual with the team its line-up was carried onto', () => {
    generate({ drawSize: 8, drawType: FIRST_MATCH_LOSER_CONSOLATION });
    const singles = (matchUp: any) => matchUp.tieMatchUps.filter((line: any) => line.matchUpType === 'SINGLES');
    const [first, second] = singles(dual(1, 1));
    enter(second.matchUpId, { winningSide: 1 });
    enter(first.matchUpId, { matchUpStatus: WALKOVER, winningSide: 1 });
    enter(singles(dual(1, 1, 'Consolation'))[1].matchUpId, { matchUpStatus: DEFAULTED, winningSide: 1 });
    enter(dual(1, 2).matchUpId, { ...won(1), matchUpStatus: RETIRED });
    const consolation = dual(1, 1, 'Consolation');
    const bye = dual(2, 1, 'Consolation');
    const beyond = dual(3, 1, 'Consolation');
    expect(bye.matchUpStatus).toEqual('BYE');

    const announced: string[] = [];
    setSubscriptions({
      subscriptions: {
        modifyMatchUp: (notices: any[]) => notices.forEach(({ matchUp }) => announced.push(matchUp.matchUpId)),
      },
    });
    const doubles = consolation.tieMatchUps.find((line: any) => line.matchUpType === 'DOUBLES');
    enter(doubles.matchUpId, { matchUpStatus: WALKOVER, winningSide: 1 });
    expect(stored(consolation.matchUpId).winningSide).toEqual(1);
    expect(stored(beyond.matchUpId).drawPositions.filter(Boolean)).toHaveLength(1);
    expect(announced.indexOf(beyond.matchUpId)).toBeGreaterThan(-1);
    expect(announced.indexOf(beyond.matchUpId)).toBeLessThan(announced.indexOf(bye.matchUpId));
  });
});
