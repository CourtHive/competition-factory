import { setOutcomePipeline } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { afterEach, describe, expect, it } from 'vitest';

// constants
import { CANNOT_CHANGE_WINNING_SIDE } from '@Constants/errorConditionConstants';
import { CONSOLATION, FEED_IN_CHAMPIONSHIP, SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { DOMINANT_DUO } from '@Constants/tieFormatConstants';
import { TEAM_MATCHUP } from '@Constants/matchUpTypes';
import { TEAM_EVENT } from '@Constants/eventConstants';
import { COMPLETED, DEFAULTED, IN_PROGRESS, RETIRED, TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';
import {
  OUTCOME_PIPELINE_DIFFERENTIAL,
  OUTCOME_PIPELINE_V1,
  OUTCOME_PIPELINE_V2,
} from '@Constants/outcomePipelineConstants';

/**
 * CLASS 4 (CA, 2026-11-20), both rules, in every pipeline mode.
 *
 * 1. A TEAM dual decided by its own exit (WALKOVER, DEFAULTED, ...) or by its own call keeps its winner while its lines
 *    project none (`dualKeepsOwnDecision`): the line is written, the dual is not un-decided, its team stays in the next
 *    dual and the result there stands. It used to go IN_PROGRESS with no winner, its team taken back out of a decided
 *    next dual and that dual's result reset.
 * 2. A LINE-DECIDED dual whose winner a line write would change or remove, with the dual's downstream active, is
 *    refused before any write (§ 2 row 14, `lineTakesPlayedOnDualWinner`). A dual scored by hand is exempt. CA rejected
 *    the alternative of accepting such a line by turning the dual into a manually declared winner.
 *
 * SINGLE_ELIMINATION 4, DOMINANT_DUO (two singles and a doubles, two rubbers win the dual), line-ups attached.
 */

const MODES = [OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_V2, OUTCOME_PIPELINE_DIFFERENTIAL] as const;

afterEach(() => setOutcomePipeline(OUTCOME_PIPELINE_V1));

const matchUps = () => tournamentEngine.allDrawMatchUps({ drawId: 'd', inContext: true }).matchUps as any[];
const find = (matchUpId: string) => matchUps().find((m) => m.matchUpId === matchUpId);
const set = (matchUpId: string, outcome: any, extra: Record<string, unknown> = {}) =>
  tournamentEngine.setMatchUpStatus({ drawId: 'd', matchUpId, outcome, ...extra });
const lineOutcome = (line: any, winningSide: number, matchUpStatus?: string) => {
  const scoreString = line.matchUpFormat.startsWith('SET3') ? '6-1 6-1' : '8-1';
  const { outcome } = mocksEngine.generateOutcomeFromScoreString({ scoreString, winningSide });
  return matchUpStatus ? { ...outcome, matchUpStatus } : outcome;
};

function setup(mode: (typeof MODES)[number]) {
  setOutcomePipeline(OUTCOME_PIPELINE_V1);
  const {
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      { drawType: SINGLE_ELIMINATION, tieFormatName: DOMINANT_DUO, eventType: TEAM_EVENT, drawSize: 4, drawId: 'd' },
    ],
    nonRandom: 1,
    setState: true,
  });
  expect(
    tournamentEngine.generateLineUps({ useDefaultEventRanking: true, attach: true, drawId: 'd', eventId }).success,
  ).toEqual(true);
  const duals = matchUps().filter((m) => m.matchUpType === TEAM_MATCHUP);
  const [A, B] = duals.filter((m) => m.roundNumber === 1);
  const final = duals.find((m) => m.roundNumber === 2);
  const lines = matchUps().filter((m) => m.matchUpTieId === A.matchUpId);
  const decideRest = () => {
    expect(set(B.matchUpId, { winningSide: 1 }).success).toEqual(true);
    expect(set(final.matchUpId, { winningSide: 1 }).success).toEqual(true);
    expect(find(final.matchUpId).matchUpStatus).toEqual(COMPLETED);
  };
  const begin = () => setOutcomePipeline(mode);
  return { A, final, lines, decideRest, begin };
}

/** the dual and the final as they stand: the dual keeps its winner, the final its two teams and its result */
function expectKept(A: any, final: any, status: string) {
  const dual = find(A.matchUpId);
  expect([dual.matchUpStatus, dual.winningSide]).toEqual([status, 1]);
  const next = find(final.matchUpId);
  expect([next.matchUpStatus, next.winningSide, next.drawPositions.filter(Boolean).length]).toEqual([COMPLETED, 1, 2]);
  expect(next.sides.some((side: any) => side.participantId === dual.sides[0].participantId)).toEqual(true);
}

describe('a dual decided by its own exit or call keeps its winner while its lines project none', () => {
  it.each(MODES)('%s: a line of a WALKOVER dual, its winner played on', (mode) => {
    const { A, final, lines, decideRest, begin } = setup(mode);
    expect(set(A.matchUpId, { matchUpStatus: WALKOVER, winningSide: 1 }).success).toEqual(true);
    decideRest();
    begin();
    const result = set(lines[1].matchUpId, lineOutcome(lines[1], 2));
    expect(result.success, JSON.stringify(result.error)).toEqual(true);
    expect(find(lines[1].matchUpId).winningSide).toEqual(2);
    expectKept(A, final, WALKOVER);
  });

  it.each(MODES)('%s: a line of a dual decided by its own call, its winner played on', (mode) => {
    const { A, final, lines, decideRest, begin } = setup(mode);
    expect(set(lines[0].matchUpId, lineOutcome(lines[0], 1)).success).toEqual(true);
    expect(set(A.matchUpId, { winningSide: 1 }).success).toEqual(true);
    decideRest();
    begin();
    const result = set(lines[1].matchUpId, lineOutcome(lines[1], 2));
    expect(result.success, JSON.stringify(result.error)).toEqual(true);
    expectKept(A, final, COMPLETED);
  });

  // generated repro B of the 2026-11-19 closeout: the line's own exit used to take team 1 out of the decided final
  it.each(MODES)('%s: a line DEFAULTED on a dual decided by its own call', (mode) => {
    const { A, final, lines, decideRest, begin } = setup(mode);
    expect(set(A.matchUpId, { winningSide: 1 }).success).toEqual(true);
    decideRest();
    begin();
    const result = set(lines[0].matchUpId, { matchUpStatus: DEFAULTED, winningSide: 1 });
    expect(result.success, JSON.stringify(result.error)).toEqual(true);
    expectKept(A, final, COMPLETED);
  });

  // generated repro A: a line re-entered RETIRED by its own winner, the dual decided by its own call
  it.each(MODES)('%s: a line re-entered RETIRED on a dual decided by its own call', (mode) => {
    const { A, final, lines, decideRest, begin } = setup(mode);
    expect(set(lines[0].matchUpId, lineOutcome(lines[0], 1)).success).toEqual(true);
    expect(set(A.matchUpId, { winningSide: 1 }).success).toEqual(true);
    decideRest();
    begin();
    const result = set(lines[0].matchUpId, lineOutcome(lines[0], 1, RETIRED));
    expect(result.success, JSON.stringify(result.error)).toEqual(true);
    expectKept(A, final, COMPLETED);
    // the dual's own call handing it to the other side stays refused, its winner played on
    expect(set(A.matchUpId, { matchUpStatus: WALKOVER, winningSide: 2 }).error).toEqual(CANNOT_CHANGE_WINNING_SIDE);
    expectKept(A, final, COMPLETED);
  });

  it.each(MODES)('%s: CONTROL, nothing played on: the dual keeps its winner and its lines decide it later', (mode) => {
    const { A, final, lines, begin } = setup(mode);
    expect(set(A.matchUpId, { matchUpStatus: WALKOVER, winningSide: 1 }).success).toEqual(true);
    begin();
    expect(set(lines[1].matchUpId, lineOutcome(lines[1], 2)).success).toEqual(true);
    expect([find(A.matchUpId).matchUpStatus, find(A.matchUpId).winningSide]).toEqual([WALKOVER, 1]);
    expect(find(final.matchUpId).drawPositions.filter(Boolean).length).toEqual(1);
    // the lines then name the other side: the tally takes over, and the final follows
    expect(set(lines[2].matchUpId, lineOutcome(lines[2], 2)).success).toEqual(true);
    expect([find(A.matchUpId).matchUpStatus, find(A.matchUpId).winningSide]).toEqual([COMPLETED, 2]);
    expect(find(final.matchUpId).matchUpStatus).toEqual(TO_BE_PLAYED);
  });
});

describe('a line-decided dual: a line taking its winner away beneath a played-on downstream is refused (row 14)', () => {
  function lineDecided(mode: (typeof MODES)[number], handScored = false) {
    const context = setup(mode);
    const { A, lines } = context;
    if (handScored) {
      expect(set(A.matchUpId, { winningSide: 1 }, { disableAutoCalc: true }).success).toEqual(true);
    } else {
      expect(set(lines[0].matchUpId, lineOutcome(lines[0], 1)).success).toEqual(true);
      expect(set(lines[1].matchUpId, lineOutcome(lines[1], 1)).success).toEqual(true);
      expect([find(A.matchUpId).matchUpStatus, find(A.matchUpId).winningSide]).toEqual([COMPLETED, 1]);
    }
    context.decideRest();
    context.begin();
    return context;
  }

  it.each(MODES)('%s: a deciding line handed to the other side', (mode) => {
    const { A, final, lines } = lineDecided(mode);
    expect(set(lines[1].matchUpId, lineOutcome(lines[1], 2)).error).toEqual(CANNOT_CHANGE_WINNING_SIDE);
    expect(find(lines[1].matchUpId).winningSide).toEqual(1);
    expectKept(A, final, COMPLETED);
  });

  it.each(MODES)('%s: a deciding line cleared', (mode) => {
    const { A, final, lines } = lineDecided(mode);
    const cleared = set(lines[0].matchUpId, { matchUpStatus: TO_BE_PLAYED, winningSide: undefined, score: undefined });
    expect(cleared.error).toEqual(CANNOT_CHANGE_WINNING_SIDE);
    expectKept(A, final, COMPLETED);
  });

  it.each(MODES)('%s: CONTROL, a line that leaves the winner standing is written', (mode) => {
    const { A, final, lines } = lineDecided(mode);
    expect(set(lines[2].matchUpId, lineOutcome(lines[2], 2)).success).toEqual(true);
    expectKept(A, final, COMPLETED);
  });

  it.each(MODES)('%s: CONTROL, a dual scored by hand is not tallied, so its lines are written', (mode) => {
    const { A, final, lines } = lineDecided(mode, true);
    const result = set(lines[0].matchUpId, lineOutcome(lines[0], 2));
    expect(result.success, JSON.stringify(result.error)).toEqual(true);
    expectKept(A, final, COMPLETED);
    expect(find(A.matchUpId).matchUpStatus).not.toEqual(IN_PROGRESS);
  });
});

// the tally relabels the dual's own DEFAULTED a played result by the same winner, its default carried to the loser
// (`propagateExitStatus`): the carry is withdrawn, as the dual's own relabel withdraws it (`relabelDualExitByTally`;
// walk FIC8 duo seed 16, 2026-11-20)
describe("a line whose tally relabels its dual's carried exit settles the carry", () => {
  it.each(MODES)('%s: the consolation matchUp the default was carried to is left to be played', (mode) => {
    setOutcomePipeline(OUTCOME_PIPELINE_V1);
    const {
      eventIds: [eventId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          drawType: FEED_IN_CHAMPIONSHIP,
          tieFormatName: DOMINANT_DUO,
          eventType: TEAM_EVENT,
          drawSize: 8,
          drawId: 'd',
        },
      ],
      nonRandom: 1,
      setState: true,
    });
    expect(
      tournamentEngine.generateLineUps({ useDefaultEventRanking: true, attach: true, drawId: 'd', eventId }).success,
    ).toEqual(true);
    const dual = matchUps().find(
      (m) => m.matchUpType === TEAM_MATCHUP && m.roundNumber === 1 && m.stage !== CONSOLATION,
    );
    expect(
      set(dual.matchUpId, { matchUpStatus: DEFAULTED, winningSide: 1 }, { propagateExitStatus: true }).success,
    ).toEqual(true);
    const loser = find(dual.matchUpId).sides.find((side: any) => side.sideNumber === 2).participantId;
    const carried = () =>
      matchUps().find(
        (m) =>
          m.matchUpType === TEAM_MATCHUP &&
          m.stage === CONSOLATION &&
          m.sides?.some((side: any) => side.participantId === loser),
      );
    const { matchUpId: carriedId } = carried();
    expect([find(carriedId).matchUpStatus, !!find(carriedId).winningSide]).toEqual([DEFAULTED, true]);
    const lines = matchUps().filter((m) => m.matchUpTieId === dual.matchUpId);
    const singles = lines.find((line) => line.matchUpFormat.startsWith('SET3'));
    const doubles = lines.find((line) => !line.matchUpFormat.startsWith('SET3'));
    expect(set(singles.matchUpId, lineOutcome(singles, 1)).success).toEqual(true);
    expect(find(dual.matchUpId).matchUpStatus).toEqual(DEFAULTED);
    setOutcomePipeline(mode);
    const result = set(doubles.matchUpId, { winningSide: 1 }, { propagateExitStatus: true });
    expect(result.success, JSON.stringify(result.error)).toEqual(true);
    expect([find(dual.matchUpId).matchUpStatus, find(dual.matchUpId).winningSide]).toEqual([COMPLETED, 1]);
    expect([find(carriedId).matchUpStatus, find(carriedId).winningSide]).toEqual([TO_BE_PLAYED, undefined]);
  });
});
