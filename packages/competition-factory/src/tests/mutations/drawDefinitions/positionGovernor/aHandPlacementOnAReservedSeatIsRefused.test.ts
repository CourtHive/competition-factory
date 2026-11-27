import { setOutcomePipeline, setSubscriptions } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { afterEach, describe, expect, it } from 'vitest';

// constants
import { CONTRADICTORY_POSITION_ACTION } from '@Constants/errorConditionConstants';
import {
  ARRIVED_FROM_RESULT,
  BYE_ADVANCEMENT_PLAYED,
  LOSER_DUE,
  PARTICIPANT_DUE,
} from '@Query/drawDefinition/positionActionRefusal';
import {
  OUTCOME_PIPELINE_DIFFERENTIAL,
  OUTCOME_PIPELINE_V1,
  OUTCOME_PIPELINE_V2,
} from '@Constants/outcomePipelineConstants';
import type { OutcomePipelineMode } from '@Constants/outcomePipelineConstants';
import {
  FIRST_MATCH_LOSER_CONSOLATION,
  FIRST_ROUND_LOSER_CONSOLATION,
  SINGLE_ELIMINATION,
} from '@Constants/drawDefinitionConstants';

/**
 * A seat that a matchUp not yet decided still owes a loser (or winner) is not filled by hand where the arrival would
 * then be refused. An arrival takes any open seat of its target matchUp (`directLoser`), so the placement is refused
 * when the target would be left with fewer open seats than the arrivals owed to it, and `context.reservedFor` names
 * those feeding matchUps. In FIRST_MATCH_LOSER_CONSOLATION the round-two arrival takes the lowest seat and replaces a
 * BYE there, so a BYE placed by hand on it is not refused (`fmlcScoreEntryAfterPositionActions.test.ts`).
 *
 * Also refused: a participant placed by hand in a structure linked with one where they are still playing (their next
 * result there would send them a second time), a swap of seats a pending feed still owes in a structure whose links
 * the swap disables, and a BYE swapped away from a seat whose opponent has played on through it.
 */

const MODES: OutcomePipelineMode[] = [OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_V2, OUTCOME_PIPELINE_DIFFERENTIAL];

afterEach(() => {
  setSubscriptions({ subscriptions: {} });
  setOutcomePipeline();
});

const played = (winningSide: 1 | 2) => ({
  score: {
    sets: [1, 2].map((setNumber) => ({
      side1Score: winningSide === 1 ? 6 : 2,
      side2Score: winningSide === 1 ? 2 : 6,
      winningSide,
      setNumber,
    })),
  },
  winningSide,
});
const cleared = { matchUpStatus: 'TO_BE_PLAYED', score: { scoreStringSide1: '', scoreStringSide2: '' } };

const drawId = 'd';
const recordNow = () => structuredClone(tournamentEngine.getTournament().tournamentRecord);
const matchUps = () => tournamentEngine.allDrawMatchUps({ drawId, inContext: true }).matchUps;
const structureOf = (name: string) =>
  tournamentEngine.getEvent({ drawId }).drawDefinition.structures.find((s: any) => s.structureName === name);
const find = (structureName: string, roundNumber: number, roundPosition: number) =>
  matchUps().find(
    (m: any) => m.structureName === structureName && m.roundNumber === roundNumber && m.roundPosition === roundPosition,
  );
const set = (matchUpId: string, outcome: any) => tournamentEngine.setMatchUpStatus({ outcome, matchUpId, drawId });
const seat = (drawPosition: number) => ({ structureId: structureOf('Consolation').structureId, drawPosition, drawId });
const inconsistencies = () =>
  (tournamentEngine.getDrawInconsistencies({ drawId }).inconsistencies ?? []).filter(
    (i: any) => i.severity === 'error',
  );

function generate(drawType: string, drawSize: number, participantsCount = drawSize) {
  setSubscriptions({ subscriptions: {} });
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawId, drawType, drawSize, participantsCount }],
    setState: true,
  });
}

function expectRefused(result: any, before: any) {
  expect(result.error).toEqual(CONTRADICTORY_POSITION_ACTION);
  expect(recordNow()).toEqual(before);
  return result.context;
}

describe.each(MODES)('a hand placement on a reserved seat is refused (%s)', (mode) => {
  it('FIRST_ROUND_LOSER_CONSOLATION: a BYE on a seat both losers of its matchUp are owed', () => {
    generate(FIRST_ROUND_LOSER_CONSOLATION, 8);
    setOutcomePipeline(mode);
    const owed = [find('Main', 1, 1).matchUpId, find('Main', 1, 2).matchUpId].sort();
    const before = recordNow();

    const bye = expectRefused(tournamentEngine.assignDrawPositionBye(seat(1)), before);
    expect(bye.mustClear).toEqual([]);
    expect(bye.reservedFor.map(({ matchUpId }) => matchUpId).sort()).toEqual(owed);
    expect(bye.reservedFor.every(({ reason }) => reason === LOSER_DUE)).toEqual(true);

    const viaAssign = expectRefused(tournamentEngine.assignDrawPosition({ ...seat(1), bye: true }), before);
    expect(viaAssign.reservedFor.map(({ matchUpId }) => matchUpId).sort()).toEqual(owed);

    const removal = expectRefused(
      tournamentEngine.removeDrawPositionAssignment({ ...seat(1), replaceWithBye: true }),
      before,
    );
    expect(removal.reservedFor.map(({ matchUpId }) => matchUpId).sort()).toEqual(owed);

    // the results the seat was owed to are entered as before, and the draw stays consistent
    expect(set(owed[0], played(1)).success).toEqual(true);
    expect(set(owed[1], played(1)).success).toEqual(true);
    expect(inconsistencies()).toEqual([]);
  });

  it('a seat no matchUp still owes takes a hand-placed BYE as before', () => {
    generate(FIRST_ROUND_LOSER_CONSOLATION, 8);
    setOutcomePipeline(mode);
    // main 1/1 is a double walkover: no loser is owed to consolation 1/1's first seat, main 1/2's loser takes the other
    expect(set(find('Main', 1, 1).matchUpId, { matchUpStatus: 'DOUBLE_WALKOVER' }).success).toEqual(true);
    const consolationSeats = structureOf('Consolation').positionAssignments;
    const open = consolationSeats.find((a: any) => !a.participantId && !a.bye && [1, 2].includes(a.drawPosition));
    expect(open).toBeDefined();
    expect(tournamentEngine.assignDrawPositionBye(seat(open.drawPosition)).success).toEqual(true);
    expect(set(find('Main', 1, 2).matchUpId, played(1)).success).toEqual(true);
  });

  it('FIRST_MATCH_LOSER_CONSOLATION: a BYE on the round-two seat is kept, a participant there is refused', () => {
    generate(FIRST_MATCH_LOSER_CONSOLATION, 8);
    setOutcomePipeline(mode);
    const fed = find('Consolation', 2, 1);
    const lowest = Math.min(...fed.drawPositions.filter(Boolean));
    const before = recordNow();
    const participantId = matchUps()
      .find((m: any) => m.structureName === 'Main' && m.roundNumber === 1)
      .sides.find((side: any) => side.participantId).participantId;
    // that participant is also still playing in the main draw, which is refused first or as well
    const refused = expectRefused(tournamentEngine.assignDrawPosition({ ...seat(lowest), participantId }), before);
    expect(refused.reservedFor.length).toBeGreaterThan(0);
    expect(tournamentEngine.assignDrawPositionBye(seat(lowest)).success).toEqual(true);
    for (const roundPosition of [1, 2, 3, 4])
      expect(set(find('Main', 1, roundPosition).matchUpId, played(1)).success).toEqual(true);
    for (const roundPosition of [1, 2])
      expect(set(find('Main', 2, roundPosition).matchUpId, played(2)).success).toEqual(true);
  });

  it('a participant still playing in the main draw is not placed in the consolation by hand', () => {
    generate(FIRST_ROUND_LOSER_CONSOLATION, 8);
    setOutcomePipeline(mode);
    const r1p1 = find('Main', 1, 1);
    expect(set(r1p1.matchUpId, { matchUpStatus: 'DOUBLE_WALKOVER' }).success).toEqual(true);
    expect(set(find('Main', 1, 3).matchUpId, played(1)).success).toEqual(true);
    const winner = find('Main', 1, 3).sides.find((side: any) => side.sideNumber === 1).participantId;
    const free = structureOf('Consolation').positionAssignments.find(
      (a: any) => !a.participantId && !a.bye && [1, 2].includes(a.drawPosition),
    );
    expect(free).toBeDefined();
    const before = recordNow();
    const due = expectRefused(
      tournamentEngine.assignDrawPosition({ ...seat(free.drawPosition), participantId: winner }),
      before,
    );
    expect(due.reservedFor).toEqual([
      expect.objectContaining({ reason: PARTICIPANT_DUE, participantId: winner, roundNumber: 2, roundPosition: 2 }),
    ]);
  });

  it('a consolation swap of seats pending losers are owed is refused, and so is one of arrived losers', () => {
    generate(FIRST_ROUND_LOSER_CONSOLATION, 8);
    setOutcomePipeline(mode);
    const consolation = structureOf('Consolation').structureId;
    const swap = () =>
      tournamentEngine.swapDrawPositionAssignments({ structureId: consolation, drawPositions: [1, 3], drawId });
    const refused = expectRefused(swap(), recordNow());
    expect(refused.reservedFor.length).toEqual(2);
    for (const roundPosition of [1, 2, 3, 4])
      expect(set(find('Main', 1, roundPosition).matchUpId, played(1)).success).toEqual(true);
    // the losers have arrived from results that stand: moving them would leave those results pointing elsewhere
    const arrived = expectRefused(swap(), recordNow());
    expect(arrived.mustClear.length).toEqual(2);
    expect(arrived.mustClear.every(({ reason }) => reason === ARRIVED_FROM_RESULT)).toEqual(true);
  });

  it('an arrived consolation loser is not removed without a BYE while the result that sent them stands', () => {
    generate(FIRST_ROUND_LOSER_CONSOLATION, 8);
    setOutcomePipeline(mode);
    const r1p1 = find('Main', 1, 1);
    expect(set(r1p1.matchUpId, played(1)).success).toEqual(true);
    const loserSeat = structureOf('Consolation').positionAssignments.find((a: any) => a.participantId).drawPosition;
    const refused = expectRefused(tournamentEngine.removeDrawPositionAssignment(seat(loserSeat)), recordNow());
    expect(refused.mustClear).toEqual([
      expect.objectContaining({ matchUpId: r1p1.matchUpId, reason: ARRIVED_FROM_RESULT }),
    ]);
    // once the result is cleared, the loser is gone and the seat can be cleared
    expect(set(r1p1.matchUpId, cleared).success).toEqual(true);
    expect(tournamentEngine.removeDrawPositionAssignment(seat(loserSeat)).success).toEqual(true);
    expect(inconsistencies()).toEqual([]);
  });

  it('a declined consolation is accepted, and a same-winner score correction keeps it', () => {
    generate(FIRST_ROUND_LOSER_CONSOLATION, 8);
    setOutcomePipeline(mode);
    const r1p1 = find('Main', 1, 1);
    expect(set(r1p1.matchUpId, played(1)).success).toEqual(true);
    const declined = structureOf('Consolation').positionAssignments.find((a: any) => a.participantId);
    // the loser declines: replaced with a BYE, the seat's links disabled
    expect(
      tournamentEngine.removeDrawPositionAssignment({ ...seat(declined.drawPosition), replaceWithBye: true }).success,
    ).toEqual(true);
    expect(
      structureOf('Consolation').positionAssignments.find((a: any) => a.drawPosition === declined.drawPosition),
    ).toMatchObject({ bye: true, disableLinks: true });
    expect(inconsistencies()).toEqual([]);
    // a score correction that keeps the winner leaves the decline in place
    expect(set(r1p1.matchUpId, played(1)).success).toEqual(true);
    expect(
      structureOf('Consolation').positionAssignments.find((a: any) => a.drawPosition === declined.drawPosition),
    ).toMatchObject({ bye: true, disableLinks: true });
  });

  it('a BYE swapped away from a seat whose opponent has played on is refused until that result is cleared', () => {
    generate(SINGLE_ELIMINATION, 8, 7);
    setOutcomePipeline(mode);
    const main = structureOf('Main');
    const bye = main.positionAssignments.find((a: any) => a.bye).drawPosition;
    const byeMatchUp = matchUps().find((m: any) => m.roundNumber === 1 && m.drawPositions.includes(bye));
    const next = matchUps().find(
      (m: any) => m.roundNumber === 2 && m.drawPositions?.some((p: number) => byeMatchUp.drawPositions.includes(p)),
    );
    const feeder = matchUps().find(
      (m: any) => m.roundNumber === 1 && m.matchUpId !== byeMatchUp.matchUpId && m.winnerMatchUpId === next.matchUpId,
    );
    expect(set(feeder.matchUpId, played(1)).success).toEqual(true);
    const r2 = matchUps().find((m: any) => m.matchUpId === next.matchUpId);
    expect(set(r2.matchUpId, played(1)).success).toEqual(true);
    const other = main.positionAssignments.find(
      (a: any) => a.participantId && Math.abs(a.drawPosition - bye) > 3,
    ).drawPosition;
    const swap = () =>
      tournamentEngine.swapDrawPositionAssignments({
        structureId: main.structureId,
        drawPositions: [bye, other],
        drawId,
      });
    const before = recordNow();
    const refused = expectRefused(swap(), before);
    expect(refused.mustClear).toEqual([
      expect.objectContaining({ matchUpId: r2.matchUpId, reason: BYE_ADVANCEMENT_PLAYED }),
    ]);
    expect(set(r2.matchUpId, cleared).success).toEqual(true);
    expect(swap().success).toEqual(true);
  });
});
