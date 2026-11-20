import { generateOutcomeFromScoreString } from '@Scoring/parse/outcomeFromScoreString';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { afterEach, describe, expect, it } from 'vitest';

// constants
import { CANNOT_CHANGE_WINNING_SIDE, INVALID_MATCHUP_STATUS } from '@Constants/errorConditionConstants';
import { FEED_IN_CHAMPIONSHIP, FIRST_MATCH_LOSER_CONSOLATION } from '@Constants/drawDefinitionConstants';
import { DOMINANT_DUO, LAVER_CUP, USTA_COLLEGE } from '@Constants/tieFormatConstants';
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

function generate(drawProfile: Record<string, unknown> = { drawSize: 4 }, nonRandom = 1) {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ eventType: TEAM, tieFormatName: DOMINANT_DUO, ...drawProfile, drawId: DRAW_ID }],
    setState: true,
    nonRandom,
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

describe('a TEAM dual opposite a BYE takes no result', () => {
  it.each([
    ['DEFAULTED, won by the team', { matchUpStatus: DEFAULTED }, 'team'],
    ['DEFAULTED, won by the BYE', { matchUpStatus: DEFAULTED }, 'bye'],
    ['WALKOVER, won by the BYE', { matchUpStatus: WALKOVER }, 'bye'],
  ])('%s: refused INVALID_MATCHUP_STATUS, and the record is unchanged', (_label, outcome, to) => {
    generate({ drawSize: 8, participantsCount: 6, drawType: FIRST_MATCH_LOSER_CONSOLATION });
    const byeDual = tournamentEngine
      .allDrawMatchUps({ drawId: DRAW_ID, inContext: true })
      .matchUps.find((matchUp: any) => !matchUp.collectionId && matchUp.matchUpStatus === 'BYE');
    const teamSide = byeDual.sides.find((side: any) => side.participantId).sideNumber;
    const winningSide = to === 'team' ? teamSide : 3 - teamSide;
    const before = record();
    const result = set(byeDual.matchUpId, { ...outcome, winningSide });
    expect(result.error).toEqual(INVALID_MATCHUP_STATUS);
    expect(record()).toEqual(before);
  });
});

describe('a team arriving at a produced walkover records where it came from, its dual decided by its lines or its own call', () => {
  it.each([
    ['by its lines', true],
    ['by its own call', false],
  ])('decided %s: the next dual is won by the team, its arrival recorded from the dual', (_label, byLines) => {
    generate();
    enter(dual(1, 1).matchUpId, { matchUpStatus: DOUBLE_WALKOVER });
    const second = dual(1, 2);
    if (byLines) {
      enter(second.tieMatchUps[1].matchUpId, { winningSide: 2 });
      enter(second.tieMatchUps[2].matchUpId, { winningSide: 2 });
    } else enter(second.matchUpId, { winningSide: 2 });

    const final = stored(second.winnerMatchUpId);
    expect([final.matchUpStatus, final.drawPositions.filter(Boolean)]).toEqual([WALKOVER, [second.drawPositions[1]]]);
    const arrivedOn = final.winningSide;
    expect(arrivedOn).toBeDefined();
    expect(final.sideExitProvenance[arrivedOn]).toEqual({
      previousMatchUpStatus: COMPLETED,
      sourceMatchUpId: second.matchUpId,
    });
  });
});

describe("a losing team's line-up where its loser link seats it, after the dual's result changes", () => {
  afterEach(() => setSubscriptions({ subscriptions: {} }));
  const retired = (winningSide: number) => ({
    ...generateOutcomeFromScoreString({ scoreString: '6-1 2-1', winningSide }).outcome,
    matchUpStatus: RETIRED,
  });
  const lineUpOf = (participantId: string) =>
    tournamentEngine
      .getTournament()
      .tournamentRecord.events[0].drawDefinitions[0].extensions?.find((extension: any) => extension.name === 'lineUps')
      ?.value?.[participantId] ?? JSON.parse(record()).events[0].drawDefinitions[0].lineUps?.[participantId];
  const players = (lineUp: any[] = []) => lineUp.map((assignment) => assignment.participantId).sort();
  /** where the dual's loser is seated: the consolation dual holding them */
  const loserSeat = (source: any) => {
    const inContext = dual(source.roundNumber, source.roundPosition);
    const loser = inContext.sides.find((side: any) => side.sideNumber !== inContext.winningSide)?.participantId;
    const target = tournamentEngine
      .allDrawMatchUps({ drawId: DRAW_ID, inContext: true })
      .matchUps.find(
        (matchUp: any) =>
          !matchUp.collectionId &&
          matchUp.structureName !== 'Main' &&
          matchUp.sides?.some((side: any) => side.participantId === loser),
      );
    return { loser, target };
  };

  it('a dual cleared and given the other winner by a carried exit: the new loser takes its own line-up there', () => {
    generate({ drawSize: 8, drawType: FEED_IN_CHAMPIONSHIP }, 28);
    const source = dual(1, 4);
    enter(source.matchUpId, { matchUpStatus: WALKOVER, winningSide: 1 });
    enter(dual(1, 2).matchUpId, { matchUpStatus: WALKOVER, winningSide: 1 });
    enter(source.matchUpId, { matchUpStatus: TO_BE_PLAYED });
    enter(source.matchUpId, { matchUpStatus: WALKOVER, winningSide: 2 }, { propagateExitStatus: true });

    const { loser, target } = loserSeat(source);
    expect(loser).toBeDefined();
    const side = target.sides.find((held: any) => held.participantId === loser);
    const storedSide = stored(target.matchUpId).sides.find((held: any) => held.sideNumber === side.sideNumber);
    expect(players(storedSide.lineUp)).toEqual(players(lineUpOf(loser)));
  });

  // the dual the new loser is seated in is announced as v1 announces it: with the event where the removal of the loser
  // it replaces announced it (a seat opposite a BYE, its line-up deleted), without it where the assignment alone did
  it.each([
    ['a played result to the other winner (FEED_IN_CHAMPIONSHIP 8/7, USTA_COLLEGE)', 30, false],
    ['a played result to the other winner by walkover (FIRST_MATCH_LOSER_CONSOLATION 8/6)', 24, true],
  ])('%s: the new loser takes its own line-up, and its dual is announced', (_label, seed, withEvent) => {
    const college = seed === 30;
    generate(
      college
        ? { drawSize: 8, participantsCount: 7, drawType: FEED_IN_CHAMPIONSHIP, tieFormatName: USTA_COLLEGE }
        : { drawSize: 8, participantsCount: 6, drawType: FIRST_MATCH_LOSER_CONSOLATION },
      seed,
    );
    if (college) enter(dual(1, 2).matchUpId, retired(1));
    const source = dual(1, 3);
    enter(source.matchUpId, retired(2));
    const replaced = loserSeat(source).target;

    const announced: any[] = [];
    setSubscriptions({ subscriptions: { modifyMatchUp: (notices: any[]) => announced.push(...notices) } });
    enter(source.matchUpId, college ? { winningSide: 1 } : { matchUpStatus: WALKOVER, winningSide: 1 });
    const { loser, target } = loserSeat(source);
    expect(target.matchUpId).toEqual(replaced.matchUpId);
    const side = target.sides.find((held: any) => held.participantId === loser);
    const storedSide = stored(target.matchUpId).sides.find((held: any) => held.sideNumber === side.sideNumber);
    expect(players(storedSide.lineUp)).toEqual(players(lineUpOf(loser)));
    const notice = announced.find((held) => held.matchUp?.matchUpId === target.matchUpId);
    expect(notice?.context).toEqual('updateSidLineUp');
    expect(!!notice?.eventId).toEqual(withEvent);
  });

  it('a walkover carried past the BYE, then corrected to the other winner: every consolation dual the new loser reaches takes its line-up', () => {
    generate({ drawSize: 8, participantsCount: 6, drawType: FIRST_MATCH_LOSER_CONSOLATION }, 36);
    const source = dual(1, 2);
    enter(source.matchUpId, { matchUpStatus: WALKOVER, winningSide: 1 }, { propagateExitStatus: true });
    const beyond = dual(2, 1, 'Consolation');
    expect(beyond.matchUpStatus).toEqual(WALKOVER);

    const announced: any[] = [];
    setSubscriptions({ subscriptions: { modifyMatchUp: (notices: any[]) => announced.push(...notices) } });
    enter(source.matchUpId, { winningSide: 2 });
    const loser = dual(1, 2).sides.find((side: any) => side.sideNumber === 1).participantId;
    const reached = tournamentEngine
      .allDrawMatchUps({ drawId: DRAW_ID, inContext: true })
      .matchUps.filter(
        (matchUp: any) =>
          !matchUp.collectionId &&
          matchUp.structureName === 'Consolation' &&
          matchUp.sides?.some((side: any) => side.participantId === loser),
      );
    // the BYE dual the loser is seated in and the dual beyond it, its carried walkover withdrawn
    expect(reached.map((matchUp: any) => matchUp.roundNumber).sort()).toEqual([1, 2]);
    for (const matchUp of reached) {
      const side = matchUp.sides.find((held: any) => held.participantId === loser);
      const storedSide = stored(matchUp.matchUpId).sides.find((held: any) => held.sideNumber === side.sideNumber);
      expect(players(storedSide.lineUp)).toEqual(players(lineUpOf(loser)));
    }
    expect(dual(2, 1, 'Consolation').matchUpStatus).toEqual(TO_BE_PLAYED);
    // the dual beyond is announced by the pass that withdraws the carried walkover, after the BYE dual
    const order = announced.map((notice) => notice.matchUp?.matchUpId);
    const notice = announced.find((held) => held.matchUp?.matchUpId === beyond.matchUpId);
    expect(notice?.context).toEqual('reconcileScoredTimes');
    expect(order.indexOf(beyond.matchUpId)).toBeGreaterThan(order.indexOf(dual(1, 1, 'Consolation').matchUpId));
  });
});

describe('a team an award sends on into a dual that still sides its position is announced by its line-up', () => {
  afterEach(() => setSubscriptions({ subscriptions: {} }));

  it('a double exit entered again on a dual its line undid: the final names the line-up write, quietly', () => {
    generate({ drawSize: 8, participantsCount: 7, tieFormatName: LAVER_CUP }, 40);
    const exited = dual(1, 2);
    const final = dual(3, 1);
    enter(exited.matchUpId, { matchUpStatus: DOUBLE_WALKOVER });
    enter(final.matchUpId, CLEARED);
    enter(exited.tieMatchUps[3].matchUpId, won(2));
    expect(stored(final.matchUpId).drawPositions.filter(Boolean)).toEqual([]);

    const announced: any[] = [];
    setSubscriptions({ subscriptions: { modifyMatchUp: (notices: any[]) => announced.push(...notices) } });
    enter(exited.matchUpId, { matchUpStatus: DOUBLE_WALKOVER }, { enableAutoCalc: true });
    const awarded = stored(exited.winnerMatchUpId);
    expect([awarded.matchUpStatus, awarded.winningSide]).toEqual([WALKOVER, 1]);
    expect(stored(final.matchUpId).drawPositions.filter(Boolean)).toHaveLength(1);
    const notice = announced.find((held) => held.matchUp?.matchUpId === final.matchUpId);
    expect([notice?.context, !!notice?.eventId, !!notice?.tournamentId]).toEqual(['updateSidLineUp', false, false]);
  });
});

describe('a dual holding the walkover a double exit produced keeps it, and its provenance, as its lines are played', () => {
  it.each([
    ['cleared', { matchUpStatus: TO_BE_PLAYED }],
    ['cleared with an empty score', CLEARED],
  ])('a line %s: the walkover stands, and the team arriving there takes it and goes on', (_label, outcome) => {
    generate({ drawSize: 8, tieFormatName: USTA_COLLEGE });
    const exited = dual(1, 4);
    enter(exited.matchUpId, { matchUpStatus: DOUBLE_WALKOVER });
    const produced = () => stored(exited.winnerMatchUpId);
    const provenance = produced().sideExitProvenance;
    expect([produced().matchUpStatus, !!provenance]).toEqual([WALKOVER, true]);

    enter(dual(2, 2).tieMatchUps[6].matchUpId, outcome);
    expect(stored(exited.matchUpId).matchUpStatus).toEqual(DOUBLE_WALKOVER);
    expect([produced().matchUpStatus, produced().sideExitProvenance, produced().winningSide]).toEqual([
      WALKOVER,
      provenance,
      undefined,
    ]);

    const feeder = dual(1, 3);
    enter(feeder.matchUpId, { winningSide: 2 });
    const arrived = feeder.drawPositions[1];
    expect([produced().matchUpStatus, produced().drawPositions.filter(Boolean)]).toEqual([WALKOVER, [arrived]]);
    expect(produced().winningSide).toBeDefined();
    expect(stored(dual(3, 1).matchUpId).drawPositions.filter(Boolean)).toEqual([arrived]);
  });
});

describe("a line deciding its dual beside a decided feeder: the consolation BYE the winner's arrival reserves is announced before the next dual", () => {
  afterEach(() => setSubscriptions({ subscriptions: {} }));

  it('the reserved consolation dual is announced first, then the next dual the line-up is carried onto, then the loser', () => {
    generate({ drawSize: 8, drawType: FIRST_MATCH_LOSER_CONSOLATION }, 18);
    enter(dual(1, 1).matchUpId, { winningSide: 2 });
    const decided = dual(1, 2);
    const next = dual(2, 1);
    const reserved = dual(2, 1, 'Consolation');
    const landing = dual(1, 1, 'Consolation');
    const lines = decided.tieMatchUps;
    const [doubles] = lines.filter((line: any) => line.matchUpType === 'DOUBLES');
    const [singles] = lines.filter((line: any) => line.matchUpType === 'SINGLES');
    enter(doubles.matchUpId, { matchUpStatus: WALKOVER, winningSide: 2 });

    const announced: string[] = [];
    setSubscriptions({
      subscriptions: {
        modifyMatchUp: (notices: any[]) => notices.forEach(({ matchUp }) => announced.push(matchUp.matchUpId)),
      },
    });
    enter(singles.matchUpId, { matchUpStatus: WALKOVER, winningSide: 2 });
    expect(stored(decided.matchUpId).winningSide).toEqual(2);
    expect(stored(next.matchUpId).drawPositions.filter(Boolean)).toHaveLength(2);
    expect(stored(reserved.matchUpId).matchUpStatus).toEqual('BYE');
    const order = [reserved, next, landing].map(({ matchUpId }) => announced.indexOf(matchUpId));
    expect(order.every((at) => at > -1)).toEqual(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });
});
