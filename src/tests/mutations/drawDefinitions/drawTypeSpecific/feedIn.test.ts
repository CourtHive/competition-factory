import { verifyStructure } from '@Tests/mutations/drawDefinitions/primitives/verifyStructure';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { FEED_IN } from '@Constants/drawDefinitionConstants';

it('can accurately generate sideNumbers', () => {
  const {
    drawIds: [drawId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        participantsCount: 32,
        drawType: FEED_IN,
        drawSize: 34,
        seedsCount: 4,
        assignSeeds: 4,
      },
    ],
  });
  tournamentEngine.setState(tournamentRecord);
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const structureId = drawDefinition.structures[0].structureId;

  verifyStructure({
    structureId,
    drawDefinition,
    expectedSeeds: 4,
    expectedSeedsWithByes: 2,
    expectedByeAssignments: 2,
    expectedSeedValuesWithBye: [3, 4],
    expectedPositionsAssignedCount: 34,
    expectedRoundMatchUpsCounts: [16, 8, 4, 2, 2, 1],
  });

  const { matchUps } = tournamentEngine.allTournamentMatchUps();
  expect(matchUps.filter((m) => m.feedRound).length).toEqual(2);
  expect(matchUps.filter((m) => m.preFeedRound).length).toEqual(2);
});

it('can generate and verify feed-in structures', () => {
  let structureId, drawDefinition;

  ({ drawDefinition } = mocksEngine.generateEventWithDraw({
    drawProfile: {
      participantsCount: 12,
      drawType: FEED_IN,
      drawSize: 12,
    },
  }));
  structureId = drawDefinition.structures[0].structureId;

  verifyStructure({
    structureId,
    drawDefinition,
    expectedRoundMatchUpsCounts: [4, 4, 2, 1],
  });

  ({ drawDefinition } = mocksEngine.generateEventWithDraw({
    drawProfile: {
      participantsCount: 11,
      drawType: FEED_IN,
      drawSize: 11,
    },
  }));
  structureId = drawDefinition.structures[0].structureId;

  verifyStructure({
    structureId,
    drawDefinition,
    expectedRoundMatchUpsCounts: [4, 2, 2, 1],
  });

  ({ drawDefinition } = mocksEngine.generateEventWithDraw({
    drawProfile: {
      participantsCount: 13,
      drawType: FEED_IN,
      drawSize: 13,
    },
  }));
  structureId = drawDefinition.structures[0].structureId;

  verifyStructure({
    structureId,
    drawDefinition,
    expectedRoundMatchUpsCounts: [4, 4, 2, 1, 1],
  });
});

it('can generate feedIn structures with various seedCounts', () => {
  let { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        enforcePolicyLimits: false,
        participantsCount: 28,
        assignSeedsCount: 4,
        drawType: FEED_IN,
        seedsCount: 4, // requires use of mocksEngine.generateTournamentRecord
        drawSize: 28,
      },
    ],
  });

  let drawDefinition = tournamentRecord.events[0].drawDefinitions[0];
  let structureId = drawDefinition.structures[0].structureId;

  verifyStructure({
    structureId,
    drawDefinition,
    expectedSeeds: 4,
    expectedSeedsWithByes: 0,
    expectedByeAssignments: 0,
    expectedSeedValuesWithBye: [],
    expectedPositionsAssignedCount: 28,
    expectedRoundMatchUpsCounts: [8, 8, 4, 4, 2, 1],
  });

  ({ tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        enforcePolicyLimits: false,
        participantsCount: 32,
        drawType: FEED_IN,
        drawSize: 34,
        seedsCount: 4, // requires use of mocksEngine.generateTournamentRecord
        assignSeedsCount: 4,
      },
    ],
  }));

  drawDefinition = tournamentRecord.events[0].drawDefinitions[0];
  structureId = drawDefinition.structures[0].structureId;

  verifyStructure({
    structureId,
    drawDefinition,
    expectedSeeds: 4,
    expectedSeedsWithByes: 2,
    expectedByeAssignments: 2,
    expectedSeedValuesWithBye: [3, 4],
    expectedPositionsAssignedCount: 34,
    expectedRoundMatchUpsCounts: [16, 8, 4, 2, 2, 1],
  });
});

it('can generate large feedIn with many BYEs', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawSize: 63,
        seedsCount: 33,
        assignSeeds: 33,
        participantsCount: 50,
        enforcePolicyLimits: false,
        seedAssignmentProfile: { 5: 4 },
        drawType: FEED_IN,
      },
    ],
  });

  const drawDefinition = tournamentRecord.events[0].drawDefinitions[0];
  const structureId = drawDefinition.structures[0].structureId;

  verifyStructure({
    structureId,
    drawDefinition,
    expectedSeeds: 33,
    expectedSeedsWithByes: 2,
    expectedByeAssignments: 13,
    expectedSeedValuesWithBye: [32, 33],
    expectedPositionsAssignedCount: 63,
    expectedRoundMatchUpsCounts: [16, 16, 8, 8, 4, 4, 2, 2, 1],
  });
});

it('can generate large feedIn with many BYEs', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 12, participantsCount: 10, drawType: FEED_IN }],
  });

  const drawDefinition = tournamentRecord.events[0].drawDefinitions[0];
  const structureId = drawDefinition.structures[0].structureId;

  verifyStructure({
    structureId,
    drawDefinition,
    expectedByeAssignments: 2,
    expectedPositionsAssignedCount: 12,
    expectedRoundMatchUpsCounts: [4, 4, 2, 1],
  });
});
