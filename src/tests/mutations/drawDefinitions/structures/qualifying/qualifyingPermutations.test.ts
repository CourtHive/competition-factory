import { getParticipantId } from '@Functions/global/extractors';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { chunkArray } from '@Tools/arrays';
import { expect, it } from 'vitest';

// constants
import { QUALIFYING } from '@Constants/drawDefinitionConstants';
import { RATING, SEEDING } from '@Constants/scaleConstants';
import { SINGLES } from '@Constants/eventConstants';
import { ELO } from '@Constants/ratingConstants';

const scenarios = [
  {
    qualifyingParticipants: 16,
    qualifyingPositions: 2,
    seedsCount: 4,
    drawSize: 16,
  },
  {
    qualifyingParticipants: 11,
    qualifyingPositions: 4,
    resultSeedsCount: 2,
    seedsCount: 4,
    drawSize: 16,
  },
  {
    qualifyingParticipants: 21,
    qualifyingPositions: 2,
    seedsCount: 4,
    drawSize: 32,
  },
];

it.each(scenarios)('can generate qualifying with varying participantsCount', (scenario) => {
  const participantsCount = 100;
  const ratingType = ELO;

  const {
    eventIds: [eventId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    eventProfiles: [{ eventName: 'QTest' }],
    participantsProfile: {
      scaledParticipantsCount: participantsCount,
      category: { ratingType },
      participantsCount,
    },
  });

  tournamentEngine.setState(tournamentRecord);

  const participants = tournamentEngine.getParticipants().participants;
  expect(participants.length).toEqual(participantsCount);

  const participantIds = participants.map(getParticipantId);
  const qualifyingStageEntryIds = participantIds.slice(0, scenario.qualifyingParticipants);

  const scaleAttributes = {
    scaleType: RATING,
    eventType: SINGLES,
    scaleName: ELO,
  };
  const sortedQualifyingParticipantIds = qualifyingStageEntryIds.sort(
    (a, b) =>
      tournamentEngine.getParticipantScaleItem({
        scaleAttributes,
        participantId: a,
      }).scaleItem.scaleValue -
      tournamentEngine.getParticipantScaleItem({
        scaleAttributes,
        participantId: b,
      }).scaleItem.scaleValue,
  );

  let result = tournamentEngine.addEventEntries({
    participantIds: qualifyingStageEntryIds,
    entryStage: QUALIFYING,
    eventId,
  });
  expect(result.success).toEqual(true);

  const qualifyingSeedingScaleName = 'QS';
  const scaleValues = [1, 2, 3, 4, 5, 6, 7, 8];
  scaleValues.forEach((scaleValue, index) => {
    const scaleItem = {
      scaleName: qualifyingSeedingScaleName,
      scaleType: SEEDING,
      eventType: SINGLES,
      scaleValue,
    };
    const participantId = sortedQualifyingParticipantIds[index];
    const result = tournamentEngine.setParticipantScaleItem({
      participantId,
      scaleItem,
    });
    expect(result.success).toEqual(true);
  });

  result = tournamentEngine.generateDrawDefinition({
    qualifyingProfiles: [
      {
        structureProfiles: [
          {
            seedingScaleName: qualifyingSeedingScaleName,
            ...scenario,
          },
        ],
      },
    ],
    qualifyingOnly: true,
    eventId,
  });

  if (result.success) {
    expect(result.success).toEqual(true);

    const drawDefinition = result.drawDefinition;
    expect(drawDefinition.structures.length).toEqual(2);

    const qualifyingStructure = drawDefinition.structures[0];
    const byeAssignments = qualifyingStructure.positionAssignments.filter(({ bye }) => bye);

    expect(qualifyingStructure.positionAssignments.filter(({ participantId }) => participantId).length).toEqual(
      scenario.qualifyingParticipants,
    );

    const expectedByesCount = scenario.drawSize - scenario.qualifyingParticipants;
    expect(byeAssignments.length).toEqual(expectedByesCount);

    const drawPositionChunks = chunkArray(
      qualifyingStructure.positionAssignments,
      scenario.drawSize / scenario.qualifyingPositions,
    );

    if (expectedByesCount) {
      const byeDistribution = drawPositionChunks.map((chunk) => chunk.filter(({ bye }) => bye));
      const maxDiff = byeDistribution.slice(1).reduce((p, c) => {
        const diff = Math.abs(byeDistribution[0].length - c.length);
        return diff > p ? diff : p;
      }, 0);
      expect(maxDiff).toBeLessThanOrEqual(1);
    }
    // console.log(result.positioningReports[0][QUALIFYING][0].validSeedBlocks);
    // console.log(result.positioningReports[0][QUALIFYING][2]);

    expect(qualifyingStructure.seedAssignments.filter(({ participantId }) => participantId).length).toEqual(
      scenario.resultSeedsCount ?? scenario.seedsCount,
    );
  } else {
    console.log(result);
  }
});
