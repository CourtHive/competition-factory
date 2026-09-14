import { getSeedBlocks, getSeedGroups, getSeedingThresholds } from '@Query/drawDefinition/getSeedBlocks';
import { getParticipantMap } from '@Query/participants/getParticipantMap';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, test } from 'vitest';

// constants
import { INVALID_VALUES } from '@Constants/errorConditionConstants';

// === getSeedBlocks tests ===

test('getSeedBlocks with cluster seeding (ITF pattern)', () => {
  // cluster: true exercises the ITF seeding pattern (lines 85-91)
  // need participantsCount large enough to get chunksCount > 4 and === 8
  const result = getSeedBlocks({ participantsCount: 32, cluster: true });
  expect(result.success).toEqual(true);
  expect(result.seedBlocks).toBeDefined();
  expect(result.seedBlocks.length).toBeGreaterThan(0);
});

test('getSeedBlocks with roundRobinGroupsCount', () => {
  const result = getSeedBlocks({ participantsCount: 16, roundRobinGroupsCount: 4 });
  expect(result.success).toEqual(true);
  expect(result.seedBlocks).toBeDefined();
});

test('getSeedBlocks with invalid participantsCount returns error', () => {
  const result = getSeedBlocks({ participantsCount: 'invalid' as any });
  expect(result.error).toEqual(INVALID_VALUES);
});

test('getSeedGroups with roundRobinGroupsCount', () => {
  const result = getSeedGroups({ drawSize: 16, roundRobinGroupsCount: 4 });
  expect(result.seedGroups).toBeDefined();
  expect(result.seedGroups.length).toBeGreaterThan(0);
});

test('getSeedGroups with invalid drawSize returns error', () => {
  const result = getSeedGroups({ drawSize: 'invalid' as any });
  expect(result.error).toEqual(INVALID_VALUES);
});

test('getSeedGroups with invalid roundRobinGroupsCount returns error', () => {
  const result = getSeedGroups({ drawSize: 16, roundRobinGroupsCount: 'invalid' as any });
  expect(result.error).toEqual(INVALID_VALUES);
});

test('getSeedingThresholds with roundRobinGroupsCount', () => {
  const result = getSeedingThresholds({ participantsCount: 16, roundRobinGroupsCount: 4 });
  expect(result.success).toEqual(true);
  expect(result.seedingThresholds).toBeDefined();
});

test('getSeedingThresholds with invalid roundRobinGroupsCount', () => {
  // For 16 participants, valid group counts are [6, 4, 3, 2]; 5 is invalid
  const result = getSeedingThresholds({ participantsCount: 16, roundRobinGroupsCount: 5 });
  expect(result.error).toEqual(INVALID_VALUES);
});

// === getParticipantMap tests ===

test('getParticipantMap with withSignInStatus', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8 }],
  });

  const { participantMap } = getParticipantMap({
    withSignInStatus: true,
    tournamentRecord,
  });

  expect(Object.keys(participantMap).length).toBeGreaterThan(0);
  // signedIn should be defined (either true or false)
  const firstParticipant = Object.values(participantMap)[0].participant;
  expect(typeof firstParticipant.signedIn).toEqual('boolean');
});

test('getParticipantMap with withScaleValues', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8, seedsCount: 4 }],
  });

  const { participantMap } = getParticipantMap({
    withScaleValues: true,
    tournamentRecord,
  });

  const firstParticipant = Object.values(participantMap)[0].participant;
  expect(firstParticipant.ratings).toBeDefined();
  expect(firstParticipant.rankings).toBeDefined();
  expect(firstParticipant.seedings).toBeDefined();
});

test('getParticipantMap with withIOC and withISO2', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8 }],
  });

  const { participantMap } = getParticipantMap({
    withIOC: true,
    withISO2: true,
    tournamentRecord,
  });

  expect(Object.keys(participantMap).length).toBeGreaterThan(0);
});

test('getParticipantMap with withGroupings', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8 }],
  });

  const { participantMap, groupInfo } = getParticipantMap({
    withGroupings: true,
    tournamentRecord,
  });

  expect(Object.keys(participantMap).length).toBeGreaterThan(0);
  // groupInfo should be defined when withGroupings is true
  expect(groupInfo).toBeDefined();
});

test('getParticipantMap with withIndividualParticipants', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8, eventType: 'DOUBLES' }],
  });

  const { participantMap } = getParticipantMap({
    withIndividualParticipants: true,
    tournamentRecord,
  });

  expect(Object.keys(participantMap).length).toBeGreaterThan(0);
});
