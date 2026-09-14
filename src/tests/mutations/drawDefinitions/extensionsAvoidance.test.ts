import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { xa } from '@Tools/extractAttributes';
import { chunkArray } from '@Tools/arrays';
import { expect, test } from 'vitest';

// constants
import { POLICY_TYPE_AVOIDANCE } from '@Constants/policyConstants';

test.each([2, 4, 8, 16])('avoidance policies based on extension values', (cohortsCount) => {
  const mockProfile = { drawProfiles: [{ generate: false, drawSize: 32 }] };
  const {
    tournamentRecord,
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord(mockProfile);

  expect(tournamentRecord.participants.length).toEqual(32);
  const cohorts = chunkArray(tournamentRecord.participants, cohortsCount);
  cohorts.forEach((cohort, i) => {
    for (const participant of cohort) {
      participant.person.extensions = [{ name: 'avoidance', value: { code: `A-${i}` } }];
    }
  });

  const deepCopyOption = false; // ensure extensins are converted w/ internalUse
  const result = tournamentEngine.setState(tournamentRecord, deepCopyOption);
  expect(result.success).toEqual(true);

  const policyDefinitions = {
    [POLICY_TYPE_AVOIDANCE]: {
      policyAttributes: [{ key: 'person._avoidance.code' }],
    },
  };

  const attachResult = tournamentEngine.attachPolicies({
    policyDefinitions,
    eventId,
  });
  expect(attachResult.success).toEqual(true);

  const participantMap = tournamentEngine.getParticipants().participantMap;
  const generationResult = tournamentEngine.generateDrawDefinition({
    eventId,
  });
  const positionAssignments = tournamentEngine.getPositionAssignments(generationResult).positionAssignments;
  const participantAvoidanceValuePairs = chunkArray(
    positionAssignments
      .map(xa('participantId'))
      .map((participantId) => participantMap[participantId].participant.person.extensions[0].value),
    2,
  );
  const conflicts = participantAvoidanceValuePairs.filter((pair) => {
    const [a, b] = pair;
    return a === b;
  });
  expect(conflicts.length).toEqual(0);
});
