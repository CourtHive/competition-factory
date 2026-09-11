import { getParticipantIdMatchUps } from '@Query/drawDefinition/participantIdMatchUps';
import { verifyStructure } from '../primitives/verifyStructure';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';
import { verifyMatchUps, verifySideNumbers } from '../primitives/verifyMatchUps';
import { generateRange, instanceCount, unique } from '@Tools/arrays';

it('can generate and verify elmination hierarchies', () => {
  let structureId, drawDefinition;

  const {
    drawIds: [drawId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawSize: 32,
        seedsCount: 8,
        participantsCount: 30,
      },
    ],
  });
  tournamentEngine.setState(tournamentRecord);
  ({ drawDefinition } = tournamentEngine.getEvent({ drawId }));
  structureId = drawDefinition.structures[0].structureId;

  verifyStructure({
    structureId,
    drawDefinition,
    expectedSeeds: 8,
    expectedSeedsWithByes: 2,
    expectedByeAssignments: 2,
    expectedSeedValuesWithBye: [1, 2],
    expectedPositionsAssignedCount: 32,
  });

  ({ drawDefinition } = mocksEngine.generateEventWithDraw({
    drawProfile: {
      drawSize: 2,
      participantsCount: 2,
    },
  }));
  structureId = drawDefinition.structures[0].structureId;

  verifyStructure({
    structureId,
    drawDefinition,
    expectedSeeds: 0,
    expectedSeedsWithByes: 0,
    expectedByeAssignments: 0,
    expectedPositionsAssignedCount: 2,
    expectedSeedValuesWithBye: [],
  });

  verifyMatchUps({
    structureId,
    drawDefinition,
    expectedRoundPending: [0],
    expectedRoundUpcoming: [1],
    expectedRoundCompleted: [0],
  });
});

it('will vary bye distribution', () => {
  const iterations = generateRange(0, 10).map(() => {
    const {
      drawIds: [drawId],
      tournamentRecord,
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          participantsCount: 26,
          assignSeedsCount: 5,
          seedsCount: 8,
          drawSize: 32,
        },
      ],
    });
    tournamentEngine.reset();
    tournamentEngine.setState(tournamentRecord);
    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    const structureId = drawDefinition.structures[0].structureId;
    const { byeAssignedDrawPositions, filteredQuarters } = verifyStructure({
      expectedPositionsAssignedCount: 32,
      expectedByeAssignments: 6,
      expectedSeeds: 5,
      drawDefinition,
      structureId,
    });

    const byesHash = byeAssignedDrawPositions?.join('|');
    const quartersHash = filteredQuarters.map((q) => q.join('|')).join('~');

    return { byesHash, quartersHash };
  });

  const byesIterations = iterations.map((i) => i.byesHash);
  const quartersIterations = iterations.map((i) => i.quartersHash);

  expect(byesIterations.length).not.toEqual(unique(byesIterations).length);
  expect(quartersIterations.length).not.toEqual(unique(quartersIterations).length);
});

it('can advance participants in elmination structures', () => {
  let structureId, drawDefinition;

  ({ drawDefinition } = mocksEngine.generateEventWithDraw({
    drawProfile: {
      drawSize: 4,
      outcomes: [],
    },
  }));
  structureId = drawDefinition.structures[0].structureId;

  verifyStructure({
    structureId,
    drawDefinition,
    expectedPositionsAssignedCount: 4,
  });

  verifyMatchUps({
    structureId,
    drawDefinition,
    expectedRoundPending: [0, 1],
    expectedRoundUpcoming: [2, 0],
    expectedRoundCompleted: [0, 0],
  });

  ({ drawDefinition } = mocksEngine.generateEventWithDraw({
    drawProfile: {
      drawSize: 4,
      outcomes: [
        {
          roundNumber: 1,
          roundPosition: 1,
          winningSide: 1,
        },
        {
          roundNumber: 1,
          roundPosition: 2,
          winningSide: 2,
        },
      ],
    },
  }));
  structureId = drawDefinition.structures[0].structureId;

  verifyMatchUps({
    structureId,
    drawDefinition,
    expectedRoundPending: [0, 0],
    expectedRoundUpcoming: [0, 1],
    expectedRoundCompleted: [2, 0],
  });

  ({ drawDefinition } = mocksEngine.generateEventWithDraw({
    drawProfile: {
      drawSize: 4,
      outcomes: [
        {
          roundNumber: 1,
          roundPosition: 1,
          winningSide: 1,
        },
        {
          roundNumber: 1,
          roundPosition: 2,
          winningSide: 2,
        },
        {
          roundNumber: 2,
          roundPosition: 1,
          winningSide: 1,
        },
      ],
    },
  }));
  structureId = drawDefinition.structures[0].structureId;

  verifyMatchUps({
    structureId,
    drawDefinition,
    expectedRoundPending: [0, 0],
    expectedRoundUpcoming: [0, 0],
    expectedRoundCompleted: [2, 1],
  });
});

it('can advance participants in elmination structures', () => {
  let structureId, drawDefinition;

  ({ drawDefinition } = mocksEngine.generateEventWithDraw({
    drawProfile: {
      participantsCount: 15,
      drawSize: 16,
      outcomes: [],
    },
  }));
  structureId = drawDefinition.structures[0].structureId;

  verifyStructure({
    structureId,
    drawDefinition,
    expectedPositionsAssignedCount: 16,
  });

  verifyMatchUps({
    structureId,
    drawDefinition,
    expectedRoundPending: [0, 4],
    expectedRoundUpcoming: [7, 0],
    expectedRoundCompleted: [0, 0],
  });

  ({ drawDefinition } = mocksEngine.generateEventWithDraw({
    drawProfile: {
      participantsCount: 15,
      drawSize: 16,
      outcomes: [
        {
          roundNumber: 1,
          roundPosition: 2,
          winningSide: 2,
        },
      ],
    },
  }));
  structureId = drawDefinition.structures[0].structureId;

  verifyMatchUps({
    structureId,
    drawDefinition,
    expectedRoundPending: [0, 3],
    expectedRoundUpcoming: [6, 1],
    expectedRoundCompleted: [1, 0],
  });

  ({ drawDefinition } = mocksEngine.generateEventWithDraw({
    drawProfile: {
      participantsCount: 15,
      drawSize: 16,
      outcomes: [
        {
          roundNumber: 1,
          roundPosition: 2,
          winningSide: 2,
        },
        {
          roundNumber: 2,
          roundPosition: 1,
          winningSide: 1,
        },
      ],
    },
  }));
  structureId = drawDefinition.structures[0].structureId;

  verifyMatchUps({
    structureId,
    drawDefinition,
    expectedRoundPending: [0, 3],
    expectedRoundUpcoming: [6, 0],
    expectedRoundCompleted: [1, 1],
  });
});

it('can reliably generate sideNumbers', () => {
  let { drawDefinition } = mocksEngine.generateEventWithDraw({
    drawProfile: {
      drawSize: 16,
      outcomes: [
        {
          roundNumber: 1,
          roundPosition: 2,
          winningSide: 1,
        },
        {
          roundNumber: 1,
          roundPosition: 4,
          winningSide: 1,
        },
        {
          roundNumber: 1,
          roundPosition: 5,
          winningSide: 2,
        },
        {
          roundNumber: 1,
          roundPosition: 8,
          winningSide: 1,
        },
      ],
    },
  });

  let structureId = drawDefinition.structures[0].structureId;

  verifyStructure({
    structureId,
    drawDefinition,
    expectedPositionsAssignedCount: 16,
  });

  let expectedDrawPositions = {
    2: [
      [[3], [2]], // for matchUp [drawPositions, sideNumbers]
      [[7], [2]],
      [[10], [1]],
      [[15], [2]],
    ],
  };
  verifySideNumbers({ structureId, drawDefinition, expectedDrawPositions });

  ({ drawDefinition } = mocksEngine.generateEventWithDraw({
    drawProfile: {
      drawSize: 16,
      outcomes: [
        {
          roundNumber: 1,
          roundPosition: 1,
          winningSide: 1,
        },
        {
          roundNumber: 1,
          roundPosition: 2,
          winningSide: 1,
        },
        {
          roundNumber: 1,
          roundPosition: 3,
          winningSide: 2,
        },
        {
          roundNumber: 1,
          roundPosition: 4,
          winningSide: 1,
        },
        {
          roundNumber: 1,
          roundPosition: 5,
          winningSide: 2,
        },
        {
          roundNumber: 1,
          roundPosition: 6,
          winningSide: 2,
        },
        {
          roundNumber: 1,
          roundPosition: 7,
          winningSide: 1,
        },
        {
          roundNumber: 1,
          roundPosition: 8,
          winningSide: 1,
        },
      ],
    },
  }));

  structureId = drawDefinition.structures[0].structureId;

  expectedDrawPositions = {
    2: [
      [
        [1, 3],
        [1, 2],
      ],
      [
        [6, 7],
        [1, 2],
      ],
      [
        [10, 12],
        [1, 2],
      ],
      [
        [13, 15],
        [1, 2],
      ],
    ],
  };

  verifySideNumbers({ structureId, drawDefinition, expectedDrawPositions });
});

it('can return participantIdMatchUps', () => {
  const { drawDefinition } = mocksEngine.generateEventWithDraw({
    drawProfile: {
      participantsCount: 14,
      idPrefix: 'Foo',
      drawSize: 16,
      outcomes: [
        {
          roundNumber: 1,
          roundPosition: 8,
          winningSide: 1,
        },
        {
          roundNumber: 1,
          roundPosition: 2,
          winningSide: 1,
        },
        {
          roundNumber: 1,
          roundPosition: 4,
          winningSide: 1,
        },
        {
          roundNumber: 1,
          roundPosition: 5,
          winningSide: 2,
        },
        {
          roundNumber: 1,
          roundPosition: 3,
          winningSide: 2,
        },
        {
          roundNumber: 1,
          roundPosition: 6,
          winningSide: 2,
        },
        {
          roundNumber: 1,
          roundPosition: 7,
          winningSide: 1,
        },
      ],
    },
  });

  const { participantIdMatchUps } = getParticipantIdMatchUps({
    drawDefinition,
  });

  const participantIds = Object.keys(participantIdMatchUps);
  expect(participantIds.length).toEqual(14);

  const matchUpsCount = participantIds.map((participantId) => participantIdMatchUps[participantId].length);

  const matchUpsCountInstances = instanceCount(matchUpsCount);
  expect(matchUpsCountInstances[1]).toEqual(6);
  expect(matchUpsCountInstances[2]).toEqual(8);
});
