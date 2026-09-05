import { allPlayoffPositionsFilled } from '@Query/drawDefinition/structureActions';
import { roundRobinWithPlayoffsTest } from './roundRobinWithPlayoffsTest';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

import {
  MAIN,
  PLAY_OFF,
  POSITION,
  ROUND_ROBIN_WITH_PLAYOFF,
  SINGLE_ELIMINATION,
} from '@Constants/drawDefinitionConstants';

it('can generate Playoffs for Round Robins when BYEs are present (1)', () => {
  const drawId = 'rr-playoffs-byes-1';
  mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawType: ROUND_ROBIN_WITH_PLAYOFF,
        participantsCount: 15,
        drawSize: 16,
        structureOptions: {
          groupSize: 4,
          playoffGroups: [
            { finishingPositions: [1, 2], structureName: 'Gold Flight', drawType: SINGLE_ELIMINATION },
            { finishingPositions: [3, 4], structureName: 'Silver Flight', drawType: SINGLE_ELIMINATION },
          ],
        },
        drawId,
      },
    ],
    completeAllMatchUps: true,
    setState: true,
  });

  const { drawDefinition: dd } = tournamentEngine.getEvent({ drawId });

  const mainStructure = dd.structures.find((s: any) => s.stage === MAIN);
  const playoffStructures = dd.structures.filter((s: any) => s.stage === PLAY_OFF);

  // Should have 2 playoff structures (Gold + Silver)
  expect(playoffStructures.length).toEqual(2);

  // Links should equal playoff groups count
  const positioningLinks = dd.links.filter((l: any) => l.linkType === POSITION);
  expect(positioningLinks.length).toEqual(2);

  // All links source from main structure
  positioningLinks.forEach((link: any) => {
    expect(link.source.structureId).toEqual(mainStructure.structureId);
  });

  // Gold Flight: 8 position assignments, 8 participants, 0 BYEs
  const goldStructure = playoffStructures.find((s: any) => s.structureName === 'Gold Flight');
  expect(goldStructure.positionAssignments.length).toEqual(8);
  const goldParticipants = goldStructure.positionAssignments.filter((pa: any) => pa.participantId);
  const goldByes = goldStructure.positionAssignments.filter((pa: any) => pa.bye);
  expect(goldParticipants.length).toEqual(8);
  expect(goldByes.length).toEqual(0);

  // Silver Flight: 8 position assignments, 7 participants, 1 BYE
  const silverStructure = playoffStructures.find((s: any) => s.structureName === 'Silver Flight');
  expect(silverStructure.positionAssignments.length).toEqual(8);
  const silverParticipants = silverStructure.positionAssignments.filter((pa: any) => pa.participantId);
  const silverByes = silverStructure.positionAssignments.filter((pa: any) => pa.bye);
  expect(silverParticipants.length).toEqual(7);
  expect(silverByes.length).toEqual(1);

  // allPlayoffPositionsFilled should be true
  const allPositionsFilled = allPlayoffPositionsFilled({
    structureId: mainStructure.structureId,
    drawDefinition: dd,
  });
  expect(allPositionsFilled).toEqual(true);
});

it('can generate Playoffs for Round Robins when BYEs are present (2)', () => {
  const playoffGroups = [
    {
      finishingPositions: [1, 2],
      structureName: 'Gold Flight',
      drawType: SINGLE_ELIMINATION,
      positionAssignmentsCount: 8,
      participantIdsCount: 8,
      byesCount: 0,
    },
    {
      finishingPositions: [3, 4],
      structureName: 'Silver Flight',
      drawType: SINGLE_ELIMINATION,
      positionAssignmentsCount: 8,
      participantIdsCount: 6,
      byesCount: 2,
    },
  ];
  roundRobinWithPlayoffsTest({
    drawSize: 16,
    groupSize: 4,
    playoffGroups,
    participantsCount: 14,
    finishingGroupSizes: [4, 4, 4, 2],
  });
});

it('can generate Playoffs for Round Robins when BYEs are present (3)', () => {
  const playoffGroups = [
    {
      finishingPositions: [1],
      structureName: 'Playoff 1',
      positionAssignmentsCount: 4,
      participantIdsCount: 4,
      byesCount: 0,
    },
    {
      finishingPositions: [2],
      structureName: 'Playoff 2',
      positionAssignmentsCount: 4,
      participantIdsCount: 4,
      byesCount: 0,
    },
    {
      finishingPositions: [3],
      structureName: 'Playoff 3',
      positionAssignmentsCount: 4,
      participantIdsCount: 4,
      byesCount: 0,
    },
    {
      finishingPositions: [4],
      structureName: 'Playoff 4',
      positionAssignmentsCount: 4,
      participantIdsCount: 4,
      byesCount: 0,
    },
  ];
  roundRobinWithPlayoffsTest({
    drawSize: 16,
    groupSize: 4,
    playoffGroups,
    participantsCount: 16,
    finishingGroupSizes: [4, 4, 4, 4],
  });
});

it('can generate Playoffs for Round Robins when BYEs are present (4)', () => {
  const playoffGroups = [
    {
      finishingPositions: [1],
      structureName: 'Playoff 1',
      positionAssignmentsCount: 4,
      participantIdsCount: 4,
      byesCount: 0,
    },
    {
      finishingPositions: [2],
      structureName: 'Playoff 2',
      positionAssignmentsCount: 4,
      participantIdsCount: 4,
      byesCount: 0,
    },
    {
      finishingPositions: [3],
      structureName: 'Playoff 3',
      positionAssignmentsCount: 4,
      participantIdsCount: 4,
      byesCount: 0,
    },
    {
      finishingPositions: [4],
      structureName: 'Playoff 4',
      positionAssignmentsCount: 4,
      participantIdsCount: 2,
      byesCount: 2,
    },
  ];
  roundRobinWithPlayoffsTest({
    drawSize: 16,
    groupSize: 4,
    playoffGroups,
    participantsCount: 14,
    finishingGroupSizes: [4, 4, 4, 2],
  });
});

it('can generate Playoffs for Round Robins when BYEs are present (5)', () => {
  const drawId = 'rr-playoffs-byes-5';
  mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawType: ROUND_ROBIN_WITH_PLAYOFF,
        participantsCount: 13,
        drawSize: 16,
        structureOptions: {
          groupSize: 4,
          playoffGroups: [
            { finishingPositions: [1], structureName: 'Playoff 1', drawType: SINGLE_ELIMINATION },
            { finishingPositions: [2], structureName: 'Playoff 2', drawType: SINGLE_ELIMINATION },
            { finishingPositions: [3], structureName: 'Playoff 3', drawType: SINGLE_ELIMINATION },
          ],
        },
        drawId,
      },
    ],
    completeAllMatchUps: true,
    setState: true,
  });

  const { drawDefinition: dd } = tournamentEngine.getEvent({ drawId });

  const mainStructure = dd.structures.find((s: any) => s.stage === MAIN);
  const playoffStructures = dd.structures.filter((s: any) => s.stage === PLAY_OFF);

  // Should have 3 playoff structures (no 4th because too many BYEs)
  expect(playoffStructures.length).toEqual(3);

  // Links should equal playoff groups count
  const positioningLinks = dd.links.filter((l: any) => l.linkType === POSITION);
  expect(positioningLinks.length).toEqual(3);

  // Playoff 1: 4 position assignments, 4 participants, 0 BYEs
  const playoff1 = playoffStructures.find((s: any) => s.structureName === 'Playoff 1');
  expect(playoff1.positionAssignments.length).toEqual(4);
  expect(playoff1.positionAssignments.filter((pa: any) => pa.participantId).length).toEqual(4);
  expect(playoff1.positionAssignments.filter((pa: any) => pa.bye).length).toEqual(0);

  // Playoff 2: 4 position assignments, 4 participants, 0 BYEs
  const playoff2 = playoffStructures.find((s: any) => s.structureName === 'Playoff 2');
  expect(playoff2.positionAssignments.length).toEqual(4);
  expect(playoff2.positionAssignments.filter((pa: any) => pa.participantId).length).toEqual(4);
  expect(playoff2.positionAssignments.filter((pa: any) => pa.bye).length).toEqual(0);

  // Playoff 3: 4 position assignments, 4 participants, 0 BYEs
  const playoff3 = playoffStructures.find((s: any) => s.structureName === 'Playoff 3');
  expect(playoff3.positionAssignments.length).toEqual(4);
  expect(playoff3.positionAssignments.filter((pa: any) => pa.participantId).length).toEqual(4);
  expect(playoff3.positionAssignments.filter((pa: any) => pa.bye).length).toEqual(0);

  // automatedPlayoffPositioning succeeds (idempotent call)
  let result: any = tournamentEngine.automatedPlayoffPositioning({
    structureId: mainStructure.structureId,
    drawId,
  });
  expect(result.success).toEqual(true);

  // allPlayoffPositionsFilled should be true
  const { drawDefinition: updatedDd } = tournamentEngine.getEvent({ drawId });
  const allPositionsFilled = allPlayoffPositionsFilled({
    structureId: mainStructure.structureId,
    drawDefinition: updatedDd,
  });
  expect(allPositionsFilled).toEqual(true);
});

it('can generate Playoffs for Round Robins when BYEs are present (6)', () => {
  const drawId = 'rr-playoffs-byes-6';
  mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawType: ROUND_ROBIN_WITH_PLAYOFF,
        participantsCount: 13,
        drawSize: 16,
        structureOptions: {
          groupSize: 4,
          playoffGroups: [
            { finishingPositions: [1], structureName: 'Playoff 1', drawType: SINGLE_ELIMINATION },
            { finishingPositions: [2], structureName: 'Playoff 2', drawType: SINGLE_ELIMINATION },
            { finishingPositions: [3, 4], structureName: 'Playoff 3', drawType: SINGLE_ELIMINATION },
          ],
        },
        drawId,
      },
    ],
    completeAllMatchUps: true,
    setState: true,
  });

  const { drawDefinition: dd } = tournamentEngine.getEvent({ drawId });

  const mainStructure = dd.structures.find((s: any) => s.stage === MAIN);
  const playoffStructures = dd.structures.filter((s: any) => s.stage === PLAY_OFF);

  // Should have 3 playoff structures
  expect(playoffStructures.length).toEqual(3);

  // Links should equal playoff groups count
  const positioningLinks = dd.links.filter((l: any) => l.linkType === POSITION);
  expect(positioningLinks.length).toEqual(3);

  // Playoff 1: 4 position assignments, 4 participants, 0 BYEs
  const playoff1 = playoffStructures.find((s: any) => s.structureName === 'Playoff 1');
  expect(playoff1.positionAssignments.length).toEqual(4);
  expect(playoff1.positionAssignments.filter((pa: any) => pa.participantId).length).toEqual(4);
  expect(playoff1.positionAssignments.filter((pa: any) => pa.bye).length).toEqual(0);

  // Playoff 2: 4 position assignments, 4 participants, 0 BYEs
  const playoff2 = playoffStructures.find((s: any) => s.structureName === 'Playoff 2');
  expect(playoff2.positionAssignments.length).toEqual(4);
  expect(playoff2.positionAssignments.filter((pa: any) => pa.participantId).length).toEqual(4);
  expect(playoff2.positionAssignments.filter((pa: any) => pa.bye).length).toEqual(0);

  // Playoff 3: 8 position assignments (combined [3,4]), participants + BYEs
  const playoff3 = playoffStructures.find((s: any) => s.structureName === 'Playoff 3');
  expect(playoff3.positionAssignments.length).toEqual(8);
  const playoff3Participants = playoff3.positionAssignments.filter((pa: any) => pa.participantId);
  const playoff3Byes = playoff3.positionAssignments.filter((pa: any) => pa.bye);
  expect(playoff3Participants.length).toEqual(5);
  expect(playoff3Byes.length).toEqual(3);

  // automatedPlayoffPositioning succeeds (idempotent call)
  let result: any = tournamentEngine.automatedPlayoffPositioning({
    structureId: mainStructure.structureId,
    drawId,
  });
  expect(result.success).toEqual(true);

  // allPlayoffPositionsFilled should be true
  const { drawDefinition: updatedDd } = tournamentEngine.getEvent({ drawId });
  const allPositionsFilled = allPlayoffPositionsFilled({
    structureId: mainStructure.structureId,
    drawDefinition: updatedDd,
  });
  expect(allPositionsFilled).toEqual(true);
});

it('can generate Playoffs for Round Robins when BYEs are present (7)', () => {
  const playoffGroups = [
    {
      finishingPositions: [1],
      structureName: 'Playoff 1',
      positionAssignmentsCount: 2,
      participantIdsCount: 2,
      byesCount: 0,
    },
    {
      finishingPositions: [2],
      structureName: 'Playoff 2',
      positionAssignmentsCount: 2,
      participantIdsCount: 2,
      byesCount: 0,
    },
    {
      finishingPositions: [3],
      structureName: 'Playoff 3',
      positionAssignmentsCount: 2,
      participantIdsCount: 2,
      byesCount: 0,
    },
    {
      finishingPositions: [4],
      structureName: 'Playoff 4',
      positionAssignmentsCount: 2,
      participantIdsCount: 1,
      byesCount: 1,
    },
  ];

  const { drawDefinition } = roundRobinWithPlayoffsTest({
    drawSize: 8,
    groupSize: 4,
    playoffGroups,
    participantsCount: 7,
    finishingGroupSizes: [2, 2, 2, 1],
  });
  const byeMatchUp = drawDefinition.structures[4].matchUps[0];
  expect(byeMatchUp.finishingPositionRange.winner).toEqual([7, 7]);
});
