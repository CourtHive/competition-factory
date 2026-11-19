import { mocksEngine } from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { MAIN, QUALIFYING } from '@Constants/drawDefinitionConstants';
import { QUALIFYING_PARTICIPANT } from '@Constants/positionActionConstants';
import { NO_DRAW_POSITIONS_AVAILABLE_FOR_QUALIFIERS, STRUCTURE_NOT_FOUND } from '@Constants/errorConditionConstants';

// pre-qualifying (8, two qualifiers) feeds qualifying (8, two qualifier positions), which feeds MAIN
const drawProfiles = [
  {
    drawSize: 8,
    qualifyingProfiles: [
      {
        roundTarget: 1,
        structureProfiles: [
          { stageSequence: 1, drawSize: 8, qualifyingPositions: 2 },
          { stageSequence: 2, drawSize: 8, qualifyingPositions: 2 },
        ],
      },
    ],
  },
];

function setup() {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({ completeAllMatchUps: true, drawProfiles });
  tournamentEngine.setState(tournamentRecord);

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const structureOf = (stage: string, stageSequence: number) =>
    drawDefinition.structures.find((s) => s.stage === stage && s.stageSequence === stageSequence);
  const preQualifying = structureOf(QUALIFYING, 1);
  const qualifying = structureOf(QUALIFYING, 2);
  const main = structureOf(MAIN, 1);

  const preQualifyingWinners = drawDefinition.structures
    .find((s) => s.structureId === preQualifying.structureId)
    .matchUps.filter(({ roundNumber }) => roundNumber === 2)
    .map(({ matchUpId }) => tournamentEngine.findMatchUp({ drawId, matchUpId, inContext: true }).matchUp)
    .map(({ sides, winningSide }) => sides.find((side) => side.sideNumber === winningSide)?.participantId);

  return { drawId, preQualifying, qualifying, main, preQualifyingWinners };
}

const qualifierPositions = (drawId: string, structureId: string) =>
  tournamentEngine
    .getPositionAssignments({ drawId, structureId })
    .positionAssignments.filter(({ qualifier }) => qualifier);

it('places pre-qualifying winners into the qualifying stage it feeds when that stage is the target', () => {
  const { drawId, qualifying, preQualifyingWinners } = setup();
  expect(preQualifyingWinners.filter(Boolean).length).toEqual(2);

  const open = qualifierPositions(drawId, qualifying.structureId);
  expect(open.length).toEqual(2);
  expect(open.every(({ participantId }) => !participantId)).toEqual(true);

  // the factory already offers the qualifier action on the qualifying stage's open positions
  const { validActions } = tournamentEngine.positionActions({
    structureId: qualifying.structureId,
    drawPosition: open[0].drawPosition,
    drawId,
  });
  const qualifierAction = validActions.find(({ type }) => type === QUALIFYING_PARTICIPANT);
  expect([...qualifierAction.qualifyingParticipantIds].sort()).toEqual([...preQualifyingWinners].sort());

  const result = tournamentEngine.qualifierProgression({ structureId: qualifying.structureId, drawId });
  expect(result.success).toEqual(true);
  expect(result.assignedParticipants.length).toEqual(2);

  const placed = qualifierPositions(drawId, qualifying.structureId).map(({ participantId }) => participantId);
  expect(placed.sort()).toEqual([...preQualifyingWinners].sort());

  // a second run finds no open qualifier position left
  const again = tournamentEngine.qualifierProgression({ structureId: qualifying.structureId, drawId });
  expect(again.error).toEqual(NO_DRAW_POSITIONS_AVAILABLE_FOR_QUALIFIERS);
});

it('draws the qualifying stage placement by the lot it is given', () => {
  for (const randomList of [
    [0, 1],
    [1, 0],
  ]) {
    const { drawId, qualifying, preQualifyingWinners } = setup();
    const positions = qualifierPositions(drawId, qualifying.structureId).map(({ drawPosition }) => drawPosition);

    const result = tournamentEngine.qualifierProgression({ structureId: qualifying.structureId, drawId, randomList });
    expect(result.success).toEqual(true);
    // the qualifiers in their order meet the positions in the lot's order
    expect(result.assignedParticipants.map(({ drawPosition }) => drawPosition)).toEqual(
      randomList.map((index) => positions[index]),
    );
    expect(result.assignedParticipants.map(({ participantId }) => participantId).sort()).toEqual(
      [...preQualifyingWinners].sort(),
    );
  }
});

it('still targets MAIN when no structure is named', () => {
  const { drawId, qualifying, main, preQualifyingWinners } = setup();
  const mainOpen = qualifierPositions(drawId, main.structureId).length;

  const result = tournamentEngine.qualifierProgression({ drawId });
  expect(result.success).toEqual(true);
  const mainPlaced = qualifierPositions(drawId, main.structureId).filter(({ participantId }) => participantId);
  expect(mainPlaced.length).toEqual(result.assignedParticipants.length);
  expect(mainPlaced.length).toBeLessThanOrEqual(mainOpen);
  // whoever MAIN took came out of the qualifying stage, never pre-qualifying, and the qualifying stage is untouched
  for (const { participantId } of mainPlaced) expect(preQualifyingWinners).not.toContain(participantId);
  expect(qualifierPositions(drawId, qualifying.structureId).every(({ participantId }) => !participantId)).toEqual(true);
});

it('refuses a target structure with no qualifier positions, and one that does not exist', () => {
  const { drawId, preQualifying } = setup();

  const noPositions = tournamentEngine.qualifierProgression({ structureId: preQualifying.structureId, drawId });
  expect(noPositions.error).toEqual(NO_DRAW_POSITIONS_AVAILABLE_FOR_QUALIFIERS);

  const missing = tournamentEngine.qualifierProgression({ structureId: 'bogus', drawId });
  expect(missing.error).toEqual(STRUCTURE_NOT_FOUND);
});
