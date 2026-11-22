import { afterEach, expect, it } from 'vitest';
import { getAllDrawMatchUps } from '@Query/matchUps/drawMatchUps';
import { heldSeatRefusal } from '@Query/matchUp/heldSeatRefusal';
import { positionTargets } from '@Query/matchUp/positionTargets';
import { matchUpsOf, positionAssignmentsOf } from '@Helpers/drawTopology/structureMembers';
import { setClock } from '@Tools/clock';
import { fixture } from './teamReversalFixture';

afterEach(() => setClock());

function competingAssignment() {
  const tournamentRecord = fixture(false);
  const event = tournamentRecord.events![0];
  const drawDefinition = event.drawDefinitions![0];
  const structure = drawDefinition.structures!.find((s) => s.stage === 'MAIN')!;
  const back = drawDefinition.structures!.find((s) => s.stage === 'CONSOLATION')!;
  const parent = matchUpsOf(structure)!.find((m) => m.roundNumber === 1 && m.roundPosition === 3)!;
  const assignments = positionAssignmentsOf(back)!;
  const oldWinner = positionAssignmentsOf(structure)!.find((seat) => seat.drawPosition === 5)!.participantId!;
  assignments.find((seat) => seat.drawPosition === 3)!.participantId = oldWinner;
  const { matchUps: inContextDrawMatchUps } = getAllDrawMatchUps({
    tournamentRecord,
    event,
    drawDefinition,
    inContext: true,
  });
  const targetData = positionTargets({ drawDefinition, matchUpId: parent.matchUpId, inContextDrawMatchUps });
  if (!targetData.targetMatchUps) throw new Error('expected linked consolation match');
  const refusal = () =>
    heldSeatRefusal({
      activeDownstream: false,
      params: {
        matchUp: parent.tieMatchUps![1],
        matchUpStatus: 'COMPLETED',
        winningSide: 2,
        projectedWinningSide: 2,
        tournamentRecord,
        drawDefinition,
        structure,
        event,
        targetData,
      },
    });
  expect(refusal()).toMatchObject({
    error: { code: 'ERR_EXISTING_PARTICIPANT_DRAW_POSITION_ASSIGNMENT' },
    context: { drawPosition: 4 },
  });
  return { targetData, assignments, refusal };
}

it('does not claim a duplicate loser assignment for a first-match feed to round two', () => {
  const { targetData, refusal } = competingAssignment();
  targetData.targetLinks.loserTargetLink!.linkCondition = 'FIRST_MATCHUP';
  targetData.targetMatchUps.loserMatchUp!.roundNumber = 2;
  expect(refusal()).toBeUndefined();
});

it('does not direct a separate losing team when both links feed the same decider', () => {
  const { targetData, refusal } = competingAssignment();
  targetData.targetMatchUps.winnerMatchUp = targetData.targetMatchUps.loserMatchUp;
  expect(refusal()).toBeUndefined();
});

it('requires a participant on the former winning side to claim a duplicate', () => {
  const { targetData, refusal } = competingAssignment();
  delete targetData.matchUp!.sides!.find((side) => side.sideNumber === 1)!.participantId;
  expect(refusal()).toBeUndefined();
});

it('requires an assignable destination to report the losing team twice', () => {
  const { targetData, assignments, refusal } = competingAssignment();
  const positions = targetData.targetMatchUps.loserMatchUp!.drawPositions!;
  for (const seat of assignments.filter((a) => positions.includes(a.drawPosition))) {
    delete seat.participantId;
    seat.qualifier = true;
  }
  expect(refusal()).toBeUndefined();
});
