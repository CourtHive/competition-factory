import { getTournamentRecord } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, test } from 'vitest';

// constants
import { INSUFFICIENT_DRAW_POSITIONS } from '@Constants/errorConditionConstants';
import { MAIN, PLAY_OFF, ROUND_ROBIN_WITH_PLAYOFF } from '@Constants/drawDefinitionConstants';

// A refused mutation must leave the record exactly as it found it, on a DIRECT call: no rollbackOnError,
// no snapshot/restore. The record is copied before the call and compared after it.
const recordCopy = () => structuredClone(getTournamentRecord(tournamentEngine.getTournamentId()));

test('a later playoff structure that cannot be positioned refuses the playoffs before the first is placed', () => {
  // two groups of 4 → playoffs for group positions 1 and 2
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        structureOptions: {
          groupSize: 4,
          playoffGroups: [
            { finishingPositions: [1], structureName: 'Gold' },
            { finishingPositions: [2], structureName: 'Silver' },
          ],
        },
        drawType: ROUND_ROBIN_WITH_PLAYOFF,
        drawSize: 8,
      },
    ],
    setState: true,
  });

  // the round robin is played; the playoffs are not positioned
  const matchUps = tournamentEngine.allTournamentMatchUps().matchUps.filter(({ stage }) => stage === MAIN);
  expect(matchUps.length).toEqual(12);
  for (const { matchUpId } of matchUps) {
    const result = tournamentEngine.setMatchUpStatus({
      outcome: { scoreString: '6-1 6-1', winningSide: 1 },
      matchUpId,
      drawId,
    });
    expect(result.success).toEqual(true);
  }

  let { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const mainStructureId = drawDefinition.structures.find(({ stage }) => stage === MAIN).structureId;
  const playoffs = drawDefinition.structures.filter(({ stage }) => stage === PLAY_OFF);
  const silver = playoffs.find(({ structureName }) => structureName === 'Silver');
  expect(silver.positionAssignments.every(({ participantId }) => !participantId)).toEqual(true);

  // a BYE placed by hand in the LATER structure leaves it a seat short for its two group runners-up
  let result: any = tournamentEngine.assignDrawPositionBye({
    drawId,
    structureId: silver.structureId,
    drawPosition: 1,
  });
  expect(result.success).toEqual(true);

  const before = recordCopy();
  result = tournamentEngine.automatedPlayoffPositioning({ drawId, structureId: mainStructureId });
  expect(result.error).toEqual(INSUFFICIENT_DRAW_POSITIONS);
  expect(recordCopy()).toEqual(before);

  ({ drawDefinition } = tournamentEngine.getEvent({ drawId }));
  const gold = drawDefinition.structures.find(({ structureName }) => structureName === 'Gold');
  expect(gold.positionAssignments.every(({ participantId }) => !participantId)).toEqual(true);
});

test('seeds that would leave too few seats for the unseeded are refused before the seeds are placed', () => {
  // an unpositioned 8 draw with 8 entries and 2 seeds; a BYE placed by hand leaves 7 seats
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8, seedsCount: 2, automated: false }],
    setState: true,
  });
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const { structureId, seedAssignments } = drawDefinition.structures[0];
  expect(seedAssignments.filter(({ participantId }) => participantId).length).toEqual(2);

  let result: any = tournamentEngine.assignDrawPositionBye({ drawId, structureId, drawPosition: 3 });
  expect(result.success).toEqual(true);

  const before = recordCopy();
  result = tournamentEngine.automatedPositioning({ drawId, structureId });
  expect(result.error).toEqual(INSUFFICIENT_DRAW_POSITIONS);
  expect(recordCopy()).toEqual(before);
});
