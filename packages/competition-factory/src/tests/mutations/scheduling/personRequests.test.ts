import { extractTime, timeStringMinutes } from '@Tools/dateTime';
import { getMatchUpId } from '@Functions/global/extractors';
import { hasSchedule } from '@Query/matchUp/hasSchedule';
import competitionEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

// constants and types
import { DO_NOT_SCHEDULE } from '@Constants/requestConstants';
import { Tournament } from '@Types/tournamentTypes';

it('can add, query, amd remove personRequests across multiple tournaments', () => {
  const { tournamentRecord: tournament1 } = mocksEngine.generateTournamentRecord();
  const { tournamentRecord: tournament2 } = mocksEngine.generateTournamentRecord();

  const personId = tournament1.participants[0].person.personId;

  competitionEngine.setState([tournament1, tournament2]);
  const { startDate, endDate } = competitionEngine.getCompetitionDateRange();

  const request = {
    date: startDate,
    startTime: '08:00',
    endTime: '10:00',
    requestType: DO_NOT_SCHEDULE,
  };
  let result = competitionEngine.addPersonRequests({
    personId,
    requests: [request],
  });
  expect(result.success).toEqual(true);

  let { personRequests } = competitionEngine.getPersonRequests();
  expect(personRequests[personId].length).toEqual(1);

  let { tournamentRecords } = competitionEngine.getState();
  // extension is only added to the tournament which includes participant with personId
  let tournamentRecord: Tournament = Object.values(tournamentRecords)[0] as Tournament;
  expect(tournamentRecord?.extensions?.length).toEqual(1);
  tournamentRecord = Object.values(tournamentRecords)[1] as Tournament;
  expect(tournamentRecord.extensions).toBeUndefined();

  let requestId = personRequests[personId][0].requestId;
  expect(requestId).not.toBeUndefined();

  result = competitionEngine.removePersonRequests({ personId, requestId });
  expect(result.success).toEqual(true);

  ({ tournamentRecords } = competitionEngine.getState());
  tournamentRecord = Object.values(tournamentRecords)[0] as Tournament;
  expect(tournamentRecord?.extensions?.length).toEqual(0);

  // now remove a request using only the requestId
  result = competitionEngine.addPersonRequests({
    personId,
    requests: [request],
  });
  expect(result.success).toEqual(true);
  ({ personRequests } = competitionEngine.getPersonRequests());
  let requestObject = personRequests[personId][0];
  requestId = requestObject.requestId;
  result = competitionEngine.removePersonRequests({ requestId });
  expect(result.success).toEqual(true);

  // now modify a request
  result = competitionEngine.addPersonRequests({
    personId,
    requests: [request],
  });
  expect(result.success).toEqual(true);
  ({ personRequests } = competitionEngine.getPersonRequests());
  requestObject = personRequests[personId][0];
  expect(requestObject.date).toEqual(startDate);
  requestObject.date = endDate;
  result = competitionEngine.modifyPersonRequests({
    requests: [requestObject],
  });
  expect(result.success).toEqual(true);
  ({ personRequests } = competitionEngine.getPersonRequests());
  requestObject = personRequests[personId][0];
  expect(requestObject.date).toEqual(endDate);
});

it('can identify conflicts with person requests', () => {
  // ensure that tournament has exactly 16 participants
  // so that conflict can be assured for testing purposes
  const participantsCount = 16;
  const drawProfiles = [{ drawSize: participantsCount, drawName: 'PRQ' }];
  const venueProfiles = [{ courtsCount: 6 }];

  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles,
    venueProfiles,
    participantsProfile: { participantsCount },
  });

  expect(tournamentRecord.participants.length).toEqual(participantsCount);

  const personId = tournamentRecord.participants[0].person.personId;

  competitionEngine.setState([tournamentRecord]);
  let { matchUps } = competitionEngine.allCompetitionMatchUps();
  const { startDate } = competitionEngine.getCompetitionDateRange();

  const request = {
    date: startDate,
    startTime: '08:00',
    endTime: '10:00',
    requestType: DO_NOT_SCHEDULE,
  };
  let result = competitionEngine.addPersonRequests({
    personId,
    requests: [request],
  });
  expect(result.success).toEqual(true);

  const matchUpIds = matchUps.filter(({ roundNumber }) => roundNumber < 3).map(getMatchUpId);

  result = competitionEngine.scheduleMatchUps({
    scheduleDate: startDate,
    matchUpIds,
  });
  expect(result.requestConflicts.length).toBeGreaterThan(0);
  expect(result.noTimeMatchUpIds.length).toEqual(0);
  expect(result.scheduledMatchUpIds.length).toEqual(12); // only scheduled 2 rounds

  ({ matchUps } = competitionEngine.allCompetitionMatchUps());
  const scheduledMatchUps = matchUps.filter(hasSchedule);
  const roundMap = scheduledMatchUps
    .map(({ roundNumber, roundPosition, drawName, schedule }) => [
      extractTime(schedule.scheduledTime),
      roundNumber,
      roundPosition,
      drawName,
    ])
    .sort((a, b) => timeStringMinutes(a[0]) - timeStringMinutes(b[0]));
  // console.log(roundMap); // useful for eye-balling
  expect(roundMap.length).toEqual(12);

  // individuals will have late recovery times due to defered scheduling / conflict avoidance
  // courts are available at 7:00, there are no recovery times specified, averageMintes = 90
  // some first round matchUps go on at 8:00 so there are some 9:30 start times
  // there is one personRequest which causes a 1st round matchUp not to be scheduled until 10:00
  // which causes 2 players to have timeAfterRecovery > 11:00 (potential timeAfterRecovery not considered)
  const lateRecoveryTimes = Object.values(result.individualParticipantProfiles)
    .map((profile: any) => profile.timeAfterRecovery)
    .filter((time) => timeStringMinutes(time) > timeStringMinutes('11:00'));

  expect(lateRecoveryTimes.length).toEqual(2);

  const potentialRecoveryTimes = Object.values(result.individualParticipantProfiles)
    .map((p: any) => p.potentialRecovery[drawId])
    .flat();

  // when potentialRecoveryTimes are considered there are twice as many lateRecoveryTimes
  const potentialLateRecoveryTimes = potentialRecoveryTimes.filter(
    (time) => timeStringMinutes(time) > timeStringMinutes('11:00'),
  );
  expect(potentialLateRecoveryTimes.length).toBeGreaterThanOrEqual(4);
});
