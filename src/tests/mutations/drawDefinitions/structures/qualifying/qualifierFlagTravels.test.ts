import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { describe, expect, it } from 'vitest';

// constants
import { MAIN, QUALIFYING, SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { BYE } from '@Constants/matchUpStatusConstants';

/**
 * `qualifier: true` MARKS A QUALIFIER, AND TRAVELS WITH IT (CA, 2026-10-15).
 *
 * A main-draw seat reserved for a qualifier carries `qualifier: true`. Placing the qualifier there keeps the flag:
 * it is how a consumer shows 'Q' beside the participant. Clearing the position removes it, and swapping positions
 * moves it with the qualifier it belongs to.
 */

const mainStructure = (drawId: string) =>
  tournamentEngine.getEvent({ drawId }).drawDefinition.structures.find((s: any) => s.stage === MAIN);
const assignmentAt = (drawId: string, drawPosition: number) =>
  mainStructure(drawId).positionAssignments.find((a: any) => a.drawPosition === drawPosition);

function completeQualifying(drawId: string) {
  const qualifying = tournamentEngine
    .getEvent({ drawId })
    .drawDefinition.structures.find((s: any) => s.stage === QUALIFYING);
  const { outcome } = mocksEngine.generateOutcomeFromScoreString({ scoreString: '6-1 6-1', winningSide: 1 });
  for (let round = 1; round <= 3; round++) {
    const matchUps =
      tournamentEngine
        .allDrawMatchUps({ drawId, inContext: true })
        .matchUps?.filter(
          (m: any) => m.structureId === qualifying.structureId && m.roundNumber === round && !m.winningSide,
        ) ?? [];
    for (const matchUp of matchUps) {
      if (matchUp.sides?.every((side: any) => side.participantId)) {
        const result = tournamentEngine.setMatchUpStatus({ matchUpId: matchUp.matchUpId, outcome, drawId });
        expect(result.success).toEqual(true);
      }
    }
  }
  return tournamentEngine
    .allDrawMatchUps({ drawId, inContext: true })
    .matchUps.filter((m: any) => m.structureId === qualifying.structureId && m.finishingRound === 1)
    .map((m: any) => m.sides.find((side: any) => side.sideNumber === m.winningSide).participantId);
}

function setUp({ drawId, participantsCount = 14 }: { drawId: string; participantsCount?: number }) {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        qualifyingProfiles: [
          {
            structureProfiles: [
              { stageSequence: 1, drawSize: 8, qualifyingPositions: 2, drawType: SINGLE_ELIMINATION },
            ],
          },
        ],
        drawSize: 16,
        participantsCount,
        drawId,
      },
    ],
    nonRandom: 20261015,
    setState: true,
  });
  const qualifierSeats = mainStructure(drawId)
    .positionAssignments.filter((a: any) => a.qualifier)
    .map((a: any) => a.drawPosition);
  expect(qualifierSeats).toHaveLength(2);
  const qualifierIds = completeQualifying(drawId);
  expect(qualifierIds).toHaveLength(2);
  const place = (index: number) =>
    tournamentEngine.qualifierDrawPositionAssignment({
      qualifyingParticipantId: qualifierIds[index],
      structureId: mainStructure(drawId).structureId,
      drawPosition: qualifierSeats[index],
      drawId,
    });
  return { qualifierSeats, qualifierIds, place, structureId: mainStructure(drawId).structureId };
}

describe('the qualifier flag', () => {
  it('stays on the seat when the qualifier is placed', () => {
    const drawId = 'q-place';
    const { qualifierSeats, qualifierIds, place } = setUp({ drawId });
    expect(place(0).success).toEqual(true);
    expect(assignmentAt(drawId, qualifierSeats[0])).toMatchObject({ participantId: qualifierIds[0], qualifier: true });
  });

  it('is removed when the position is cleared', () => {
    const drawId = 'q-clear';
    const { qualifierSeats, place, structureId } = setUp({ drawId });
    expect(place(0).success).toEqual(true);
    const result = tournamentEngine.removeDrawPositionAssignment({
      drawPosition: qualifierSeats[0],
      structureId,
      drawId,
    });
    expect(result.success).toEqual(true);
    const assignment = assignmentAt(drawId, qualifierSeats[0]);
    expect(assignment.participantId).toBeUndefined();
    expect(assignment.qualifier).toBeUndefined();
  });

  it('travels with the qualifier when it is swapped with a direct entry', () => {
    const drawId = 'q-swap-direct';
    const { qualifierSeats, qualifierIds, place, structureId } = setUp({ drawId });
    expect(place(0).success).toEqual(true);
    const direct = mainStructure(drawId).positionAssignments.find((a: any) => a.participantId && !a.qualifier);
    const result = tournamentEngine.swapDrawPositionAssignments({
      drawPositions: [qualifierSeats[0], direct.drawPosition],
      structureId,
      drawId,
    });
    expect(result.success).toEqual(true);
    expect(assignmentAt(drawId, direct.drawPosition)).toMatchObject({
      participantId: qualifierIds[0],
      qualifier: true,
    });
    const vacated = assignmentAt(drawId, qualifierSeats[0]);
    expect(vacated.participantId).toEqual(direct.participantId);
    expect(vacated.qualifier).toBeUndefined();
  });

  it('travels with each qualifier when two placed qualifiers are swapped', () => {
    const drawId = 'q-swap-both';
    const { qualifierSeats, qualifierIds, place, structureId } = setUp({ drawId });
    expect(place(0).success).toEqual(true);
    expect(place(1).success).toEqual(true);
    const result = tournamentEngine.swapDrawPositionAssignments({
      drawPositions: qualifierSeats,
      structureId,
      drawId,
    });
    expect(result.success).toEqual(true);
    expect(assignmentAt(drawId, qualifierSeats[0])).toMatchObject({ participantId: qualifierIds[1], qualifier: true });
    expect(assignmentAt(drawId, qualifierSeats[1])).toMatchObject({ participantId: qualifierIds[0], qualifier: true });
  });

  it('travels with the qualifier when it is swapped with a BYE, and the BYE still advances its opponent', () => {
    const drawId = 'q-swap-bye';
    const { qualifierSeats, qualifierIds, place, structureId } = setUp({ drawId, participantsCount: 13 });
    expect(place(0).success).toEqual(true);
    const bye = mainStructure(drawId).positionAssignments.find((a: any) => a.bye);
    expect(bye).toBeDefined();
    const result = tournamentEngine.swapDrawPositionAssignments({
      drawPositions: [qualifierSeats[0], bye.drawPosition],
      structureId,
      drawId,
    });
    expect(result.success).toEqual(true);
    expect(assignmentAt(drawId, bye.drawPosition)).toMatchObject({ participantId: qualifierIds[0], qualifier: true });
    const nowBye = assignmentAt(drawId, qualifierSeats[0]);
    expect(nowBye.bye).toEqual(true);
    expect(nowBye.qualifier).toBeUndefined();
    expect(nowBye.participantId).toBeUndefined();

    // the BYE's matchUp is a BYE and its opponent has advanced
    const byeMatchUp = tournamentEngine
      .allDrawMatchUps({ drawId, inContext: true })
      .matchUps.find(
        (m: any) => m.structureId === structureId && m.roundNumber === 1 && m.drawPositions.includes(qualifierSeats[0]),
      );
    expect(byeMatchUp.matchUpStatus).toEqual(BYE);
    const opponent = byeMatchUp.sides.find((side: any) => side.drawPosition !== qualifierSeats[0])?.participantId;
    const nextMatchUp = tournamentEngine
      .allDrawMatchUps({ drawId, inContext: true })
      .matchUps.find((m: any) => m.matchUpId === byeMatchUp.winnerMatchUpId);
    expect(opponent).toBeDefined();
    expect(nextMatchUp.sides.map((side: any) => side.participantId)).toContain(opponent);
  });
});
