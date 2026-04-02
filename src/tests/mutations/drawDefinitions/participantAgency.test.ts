import { resolveDrawPositions } from '@Assemblies/generators/drawDefinitions/drawPositionsResolver';
import { getDrawPosition, getParticipantId } from '@Functions/global/extractors';
import { generateRange, randomPop, unique } from '@Tools/arrays';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { nextPowerOf2 } from '@Tools/math';
import { expect, it } from 'vitest';

// these tests were written in preparation for enabling automated draw positioning
// using "participant agency" protocols including drawPosition preferences for non-seeded particpants

it.each([
  { participantsCount: 64, seedsCount: 16, automated: true },
  { participantsCount: 63, seedsCount: 16, automated: true },
  { participantsCount: 63, seedsCount: 16, automated: false },
  { participantsCount: 45, seedsCount: 8, automated: { seedsOnly: true } }, // only places byes for seeded participants
  { participantsCount: 63, seedsCount: 16, automated: { seedsOnly: true } },
  { participantsCount: 50, seedsCount: 16, automated: { seedsOnly: true } },
])('mocksEngine can generate seedsCount seeded participants', ({ participantsCount, seedsCount, automated }) => {
  const drawSize = nextPowerOf2(participantsCount);
  const expectedByes = drawSize - participantsCount;
  const drawProfiles = [
    {
      drawSize,
      participantsCount,
      seedsCount,
      automated,
    },
  ];
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount },
    drawProfiles,
  });

  tournamentEngine.setState(tournamentRecord);

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });

  const { positionAssignments, seedAssignments } = drawDefinition.structures[0];
  const assignedParticipantIds = positionAssignments.filter(({ participantId }) => participantId).map(getParticipantId);
  const seedsOnly = typeof automated === 'object' && automated.seedsOnly;
  const assignedByes = positionAssignments.filter(({ bye }) => bye);
  let expectedByeCount = 0;
  if (seedsOnly) expectedByeCount = Math.min(expectedByes, seedsCount);
  else if (automated) expectedByeCount = expectedByes;
  expect(assignedByes.length).toEqual(expectedByeCount);

  let expectedAssigned = 0;
  if (seedsOnly) expectedAssigned = seedsCount;
  else if (automated) expectedAssigned = participantsCount;
  expect(assignedParticipantIds.length).toEqual(expectedAssigned);
  const assignedSeedParticipantIds = seedAssignments.map(({ participantId }) => participantId);
  expect(assignedSeedParticipantIds.length).toEqual(seedsCount);

  if (seedsOnly) {
    const participantIds = tournamentRecord.participants.map(({ participantId }) => participantId);
    const unassignedParticipantIds = participantIds.filter(
      (participantId) => !assignedParticipantIds.includes(participantId),
    );
    const unseededParticipantsCount = drawSize - assignedByes.length - assignedSeedParticipantIds.length;
    const unassignedDrawPositions = positionAssignments
      .filter((assignment) => !assignment.participantId && !assignment.bye)
      .map(getDrawPosition);
    expect(unassignedDrawPositions.length).toEqual(unseededParticipantsCount);

    const participantIdsWithAgency = unassignedParticipantIds.slice(0, unseededParticipantsCount);
    expect(unseededParticipantsCount).toEqual(participantIdsWithAgency.length);

    const participantFactors = Object.assign(
      {},
      ...participantIdsWithAgency.map((participantId) => {
        const range = generateRange(0, unassignedDrawPositions.length - 1);
        const preferences = [1, 2, 3].map(() => {
          const index = randomPop(range);
          return unassignedDrawPositions[index];
        });
        return { [participantId]: { preferences } };
      }),
    );

    const { drawPositionResolutions, report } = resolveDrawPositions({
      positionAssignments,
      participantFactors,
    });
    expect(typeof report === 'object').toEqual(true);
    // logging for diagnostics
    // console.log({ report });

    const resolvedDrawPositions = Object.keys(drawPositionResolutions);
    expect(unassignedDrawPositions.length).toEqual(resolvedDrawPositions.length);

    expect(unique(resolvedDrawPositions).length).toEqual(unique(Object.values(drawPositionResolutions)).length);
  }
});
