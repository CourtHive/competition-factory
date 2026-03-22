import { visualizeScheduledMatchUps } from '../../testHarness/testUtilities/visualizeScheduledMatchUps';
import { getStructureRoundProfile } from '@Query/structure/getStructureRoundProfile';
import { getRoundMatchUps } from '@Query/matchUps/getRoundMatchUps';
import { getMatchUpIds } from '@Functions/global/extractors';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it, test } from 'vitest';

import POLICY_SCHEDULING_DEFAULT from '@Fixtures/policies/POLICY_SCHEDULING_DEFAULT';
import SEEDING_ITF_POLICY from '@Fixtures/policies/POLICY_SEEDING_ITF';
import { SINGLES_EVENT } from '@Constants/eventConstants';
import {
  INVALID_DATE,
  INVALID_TIME,
  MISSING_MATCHUP_IDS,
  MISSING_SCHEDULE,
  VENUE_NOT_FOUND,
} from '@Constants/errorConditionConstants';

it('can bulk schedule matchUps', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    startDate: '2021-01-01',
    endDate: '2021-01-07',
  });
  const { participants } = tournamentRecord;

  tournamentEngine.setState(tournamentRecord);

  const myCourts = { venueName: 'My Courts' };
  let result = tournamentEngine.devContext({ addVenue: true }).addVenue({ venue: myCourts });
  const {
    venue: { venueId },
  } = result;
  expect(result.success).toEqual(true);

  const event = {
    eventName: 'Test Event',
    eventType: SINGLES_EVENT,
  };

  result = tournamentEngine.addEvent({ event });
  const { event: eventResult, success } = result;
  const { eventId } = eventResult;
  expect(success).toEqual(true);

  const participantIds = participants.map((p) => p.participantId);
  result = tournamentEngine.addEventEntries({ eventId, participantIds });
  expect(result.success).toEqual(true);

  const values = {
    automated: true,
    drawSize: 32,
    eventId,
    seedsCount: 8,
    event: eventResult,
    policyDefinitions: { ...SEEDING_ITF_POLICY },
  };
  const { drawDefinition } = tournamentEngine.generateDrawDefinition(values);

  result = tournamentEngine.addDrawDefinition({ eventId, drawDefinition });
  expect(result.success).toEqual(true);

  const { structureId } = drawDefinition.structures[0];
  const { roundMatchUps } = getStructureRoundProfile({
    drawDefinition,
    structureId,
  });

  const matchUpIds = roundMatchUps?.[1].map((matchUp) => matchUp.matchUpId);

  let schedule: any = { scheduledTime: '08:00 x y z' };
  result = tournamentEngine.bulkScheduleTournamentMatchUps({
    matchUpIds,
    schedule,
  });
  expect(result.error).toEqual(INVALID_TIME);

  schedule = { venueId: 'bogus venue' };
  result = tournamentEngine.bulkScheduleTournamentMatchUps({
    matchUpIds,
    schedule,
  });
  expect(result.error).toEqual(VENUE_NOT_FOUND);

  schedule = { scheduledDate: 'December 3rd 2100' };
  result = tournamentEngine.bulkScheduleTournamentMatchUps({
    matchUpIds,
    schedule,
  });
  expect(result.error).toEqual(INVALID_DATE);

  const scheduledDate = '2021-01-01';
  const scheduledTime = '08:00';
  schedule = {
    scheduledTime,
    scheduledDate,
    venueId,
  };

  result = tournamentEngine.bulkScheduleTournamentMatchUps({ schedule });
  expect(result.error).toEqual(MISSING_MATCHUP_IDS);

  result = tournamentEngine.bulkScheduleTournamentMatchUps({ matchUpIds });
  expect(result.error).toEqual(MISSING_SCHEDULE);

  result = tournamentEngine.bulkScheduleTournamentMatchUps({
    matchUpIds,
    schedule,
  });
  expect(result.success).toEqual(true);

  let { matchUps } = tournamentEngine.allTournamentMatchUps();
  let matchUpsWithScheduledTime = matchUps.filter((matchUp) => matchUp.schedule?.scheduledTime);

  expect(matchUpsWithScheduledTime.length).toEqual(matchUpIds?.length);

  schedule = {
    scheduledTime: '',
    scheduledDate: '',
    venueId,
  };
  result = tournamentEngine.bulkScheduleTournamentMatchUps({
    matchUpIds,
    schedule,
  });
  expect(result.success).toEqual(true);

  ({ matchUps } = tournamentEngine.allTournamentMatchUps());
  matchUpsWithScheduledTime = matchUps.filter((matchUp) => matchUp.schedule?.scheduledTime);
  expect(matchUpsWithScheduledTime.length).toEqual(0);
});

test('recognizes scheduling conflicts', () => {
  const eventProfiles = [
    {
      eventName: 'Event Test',
      eventType: SINGLES_EVENT,
      drawProfiles: [
        {
          drawSize: 16,
        },
      ],
    },
  ];
  const startDate = '2022-01-01';
  const endDate = '2022-01-07';
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    eventProfiles,
    startDate,
    endDate,
  });

  tournamentEngine.setState(tournamentRecord);

  tournamentEngine.attachPolicies({
    policyDefinitions: POLICY_SCHEDULING_DEFAULT,
  });

  let { matchUps } = tournamentEngine.allCompetitionMatchUps();
  let roundMatchUps: any = getRoundMatchUps({ matchUps })?.roundMatchUps;

  const scheduledDate = '2022-01-01';
  let schedule = {
    scheduledTime: '08:00',
    scheduledDate,
  };
  let matchUpIds = getMatchUpIds(roundMatchUps[1]);
  let result = tournamentEngine.bulkScheduleTournamentMatchUps({
    matchUpIds,
    schedule,
  });
  expect(result.success).toEqual(true);

  schedule = {
    scheduledTime: '09:00',
    scheduledDate,
  };
  matchUpIds = getMatchUpIds(roundMatchUps[2]);
  result = tournamentEngine.bulkScheduleTournamentMatchUps({
    matchUpIds,
    schedule,
  });
  expect(result.success).toEqual(true);

  ({ matchUps } = tournamentEngine.allCompetitionMatchUps({
    afterRecoveryTimes: true,
    nextMatchUps: true,
  }));
  expect(Object.keys(matchUps[0].schedule).includes('scheduledDate')).toEqual(true);

  visualizeScheduledMatchUps({
    scheduledMatchUps: matchUps,
    showGlobalLog: false,
  });

  ({ roundMatchUps } = getRoundMatchUps({ matchUps }));
  roundMatchUps[1].forEach((firstRoundMatchUp) => {
    expect(typeof firstRoundMatchUp.winnerTo.schedule.scheduleConflict).toEqual('string');
  });
  roundMatchUps[2].forEach((secondRoundMatchUp) =>
    expect(typeof secondRoundMatchUp.schedule.scheduleConflict).toEqual('string'),
  );

  const { participantIdsWithConflicts: ceConflicts } = tournamentEngine.getCompetitionParticipants({
    scheduleAnalysis: true,
  });

  const { participants: tournamentParticipants, participantIdsWithConflicts: teConflicts } =
    tournamentEngine.getParticipants({
      scheduleAnalysis: true,
      withMatchUps: true,
    });

  expect(teConflicts.length).toEqual(16);
  expect(ceConflicts.length).toEqual(16);

  const participantResult = tournamentEngine.getCompetitionParticipants({
    scheduleAnalysis: { scheduledMinutesDifference: Infinity },
  });
  let { participantIdsWithConflicts: gpConflicts, mappedMatchUps, participantMap } = participantResult;
  const participants = participantResult.participants;
  expect(Object.values(participantMap).length).toEqual(16);
  expect(participants.length).toEqual(16);
  expect(gpConflicts.length).toEqual(16);
  expect(mappedMatchUps).toBeDefined();

  ({
    participantIdsWithConflicts: gpConflicts,
    mappedMatchUps,
    participantMap,
  } = tournamentEngine.getParticipants({
    scheduleAnalysis: true,
  }));
  expect(gpConflicts.length).toEqual(16);

  const participantWithConflict = tournamentParticipants.find(({ participantId }) =>
    teConflicts.includes(participantId),
  );

  const matchUpId = participantWithConflict.potentialMatchUps[0].matchUpId;
  const scheduleConflict = mappedMatchUps[matchUpId].schedule.scheduleConflict;
  expect(typeof scheduleConflict).toEqual('string');

  const targetParticipantId = participantWithConflict.participantId;
  expect(
    typeof mappedMatchUps[Object.keys(participantMap[targetParticipantId].potentialMatchUps)[0]].schedule
      .scheduleConflict,
  ).toEqual('string');

  let { participantIdsWithConflicts } = tournamentEngine.getCompetitionParticipants({
    scheduleAnalysis: { scheduledMinutesDifference: 60 },
  });

  expect(participantIdsWithConflicts.length).toEqual(16);

  ({ participantIdsWithConflicts } = tournamentEngine.getCompetitionParticipants({
    scheduleAnalysis: { scheduledMinutesDifference: 50 },
  }));

  expect(participantIdsWithConflicts.length).toEqual(0);

  ({ participantIdsWithConflicts: gpConflicts } = tournamentEngine.getParticipants({
    scheduleAnalysis: { scheduledMinutesDifference: 60 },
  }));
  expect(gpConflicts.length).toEqual(16);

  ({ participantIdsWithConflicts: gpConflicts } = tournamentEngine.getParticipants({
    scheduleAnalysis: { scheduledMinutesDifference: 50 },
  }));
  expect(gpConflicts.length).toEqual(0);

  ({ participantIdsWithConflicts: gpConflicts } = tournamentEngine.getCompetitionParticipants({
    scheduleAnalysis: { scheduledMinutesDifference: 60 },
  }));
  expect(gpConflicts.length).toEqual(16);

  ({ participantIdsWithConflicts: gpConflicts } = tournamentEngine.getCompetitionParticipants({
    scheduleAnalysis: { scheduledMinutesDifference: 50 },
  }));
  expect(gpConflicts.length).toEqual(0);
});
