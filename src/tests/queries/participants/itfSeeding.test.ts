import { generateRange, unique } from '@Tools/arrays';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { CLUSTER, MAIN } from '@Constants/drawDefinitionConstants';

it('can generate draw with appropriate ITF seeding', () => {
  const seeding = {
    policyName: 'ITF',
    duplicateSeedNumbers: true,
    drawSizeProgression: true,
    validSeedPositions: { ignore: true },
    seedingProfile: { positioning: CLUSTER },
    seedsCountThresholds: [
      { drawSize: 4, minimumParticipantCount: 3, seedsCount: 2 },
      { drawSize: 16, minimumParticipantCount: 12, seedsCount: 4 },
      { drawSize: 32, minimumParticipantCount: 24, seedsCount: 8 },
      { drawSize: 64, minimumParticipantCount: 48, seedsCount: 16 },
      { drawSize: 128, minimumParticipantCount: 97, seedsCount: 32 },
      { drawSize: 256, minimumParticipantCount: 192, seedsCount: 64 },
    ],
  };

  let mockProfile: any = {
    drawProfiles: [
      {
        category: { categoryName: '12U' },
        policyDefinitions: { seeding },
        rankingRange: [1, 15],
        drawSize: 32,
        seedsCount: 8,
      },
    ],
  };

  let { tournamentRecord } = mocksEngine.generateTournamentRecord(mockProfile);
  expect(tournamentRecord.events[0].drawDefinitions[0].structures[0].seedAssignments.length).toEqual(8);

  mockProfile = {
    drawProfiles: [
      {
        category: { categoryName: '12U' },
        policyDefinitions: { seeding },
        participantsCount: 23,
        rankingRange: [1, 15],
        seedsCount: 8,
        drawSize: 32,
      },
    ],
  };

  tournamentRecord = mocksEngine.generateTournamentRecord(mockProfile).tournamentRecord;
  expect(tournamentRecord.events[0].drawDefinitions[0].structures[0].seedAssignments.length).toEqual(4);

  mockProfile = {
    drawProfiles: [
      {
        category: { categoryName: '12U' },
        policyDefinitions: { seeding },
        participantsCount: 96,
        rankingRange: [1, 32],
        seedsCount: 32,
        drawSize: 128,
      },
    ],
  };

  tournamentRecord = mocksEngine.generateTournamentRecord(mockProfile).tournamentRecord;
  expect(tournamentRecord.events[0].drawDefinitions[0].structures[0].seedAssignments.length).toEqual(16);

  mockProfile = {
    drawProfiles: [
      {
        category: { categoryName: '12U' },
        policyDefinitions: { seeding },
        participantsCount: 97,
        rankingRange: [1, 32],
        seedsCount: 32,
        drawSize: 128,
      },
    ],
  };

  tournamentRecord = mocksEngine.generateTournamentRecord(mockProfile).tournamentRecord;
  expect(tournamentRecord.events[0].drawDefinitions[0].structures[0].seedAssignments.length).toEqual(32);

  tournamentEngine.setState(tournamentRecord);
  const { participants } = tournamentEngine.getParticipants({
    withSeeding: true,
    withEvents: true,
    withDraws: true,
  });
  const targetParticipants = participants.filter((participant) => participant.events[0].seedValue);
  const seedingScaleValues = targetParticipants.map((participant) => participant.events[0].seedValue);

  expect(unique(seedingScaleValues).length).toEqual(32);
  expect(seedingScaleValues).toEqual(generateRange(1, 33));

  expect(unique(targetParticipants.map((p) => p.draws[0].seedAssignments[MAIN])).length).toEqual(32);
});
