import { getRoundMatchUps } from '@Query/matchUps/getRoundMatchUps';
import { eventConstants } from '@Constants/eventConstants';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, test } from 'vitest';

import POLICY_SCHEDULING_DEFAULT from '@Fixtures/policies/POLICY_SCHEDULING_DEFAULT';
import { INDIVIDUAL } from '@Constants/participantConstants';

const { SINGLES, DOUBLES } = eventConstants;

test('recognizes scheduling conflicts', () => {
  const venueProfiles = [{ courtsCount: 6 }];
  const eventProfiles = [
    {
      drawProfiles: [{ idPrefix: 'd1', drawSize: 16 }],
      eventType: SINGLES,
    },
    {
      drawProfiles: [{ idPrefix: 'd2', drawSize: 16 }],
      eventType: DOUBLES,
    },
  ];
  const startDate = '2022-01-01';
  const endDate = '2022-01-07';
  let result = mocksEngine.generateTournamentRecord({
    participantsProfile: { idPrefix: 'xyz' },
    venueProfiles,
    eventProfiles,
    startDate,
    endDate,
  });
  const { eventIds, tournamentRecord } = result;
  tournamentEngine.setState(tournamentRecord);

  tournamentEngine.attachPolicies({
    policyDefinitions: POLICY_SCHEDULING_DEFAULT,
  });

  let { matchUps } = tournamentEngine.allCompetitionMatchUps({
    contextFilters: { eventIds: [eventIds[0]] },
  });
  let roundMatchUps: any = getRoundMatchUps({ matchUps }).roundMatchUps;

  const scheduledDate = '2022-01-01';
  let schedule = {
    scheduledTime: '08:00',
    scheduledDate,
  };
  let matchUpIds = roundMatchUps[1].map(({ matchUpId }) => matchUpId);
  result = tournamentEngine.bulkScheduleTournamentMatchUps({
    matchUpIds,
    schedule,
  });
  expect(result.success).toEqual(true);

  schedule = {
    scheduledTime: '09:00',
    scheduledDate,
  };
  matchUpIds = roundMatchUps[2].map(({ matchUpId }) => matchUpId);
  result = tournamentEngine.bulkScheduleTournamentMatchUps({
    matchUpIds,
    schedule,
  });
  expect(result.success).toEqual(true);

  ({ matchUps } = tournamentEngine.allCompetitionMatchUps({
    contextFilters: { eventIds: [eventIds[0]] },
    afterRecoveryTimes: true,
    nextMatchUps: true,
  }));
  expect(Object.keys(matchUps[0].schedule).includes('scheduledDate')).toEqual(true);

  ({ roundMatchUps } = getRoundMatchUps({ matchUps }));
  roundMatchUps[1].forEach((firstRoundMatchUp) => {
    expect(typeof firstRoundMatchUp.winnerTo.schedule.scheduleConflict).toEqual('string');
  });
  roundMatchUps[2].forEach((secondRoundMatchUp) => {
    expect(typeof secondRoundMatchUp.winnerTo.schedule.scheduleConflict === 'string').toEqual(false);
  });

  const pp = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: [INDIVIDUAL] },
    scheduleAnalysis: true,
    withStatistics: true,
    withMatchUps: true,
  });

  expect(pp.participantIdsWithConflicts.length).toEqual(16);

  const ppWithConflict = pp.participants.find(({ participantId }) =>
    pp.participantIdsWithConflicts.includes(participantId),
  );
  const firstPotential = pp.mappedMatchUps[ppWithConflict.potentialMatchUps[0].matchUpId];
  expect(firstPotential.schedule.scheduleConflict.startsWith('d1-1')).toEqual(true);

  const { participants: competitionParticipants, participantIdsWithConflicts } =
    tournamentEngine.getCompetitionParticipants({
      scheduleAnalysis: { scheduledMinutesDifference: 60 },
      withStatistics: true,
    });

  expect(participantIdsWithConflicts.length).toEqual(16);
  expect(competitionParticipants[0].scheduleConflicts.length).toEqual(1);
  expect(typeof competitionParticipants[0].scheduleConflicts[0].priorScheduledMatchUpId).toEqual('string');
  expect(typeof competitionParticipants[0].scheduleConflicts[0].matchUpIdWithConflict).toEqual('string');

  result = tournamentEngine.getCompetitionParticipants({
    scheduleAnalysis: { scheduledMinutesDifference: 60 },
    withPotentialMatchUps: true,
    withStatistics: true,
  });

  expect(result.participantIdsWithConflicts.length).toEqual(16);

  const targetParticipant = result.participants.find(
    ({ participantId }) => participantId === competitionParticipants[0].participantId,
  );
  expect(targetParticipant.scheduleConflicts.length).toEqual(1);
  expect(targetParticipant.potentialMatchUps.length).toEqual(2);

  const cp = tournamentEngine.getCompetitionParticipants({
    scheduleAnalysis: { scheduledMinutesDifference: 50 },
    withStatistics: true,
  });

  expect(cp.participantIdsWithConflicts.length).toEqual(0);
});
