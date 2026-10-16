import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// Constants
import { POLICY_TYPE_SCHEDULING } from '@Constants/policyConstants';
import { DO_NOT_SCHEDULE } from '@Constants/requestConstants';

// V2: v2Scheduler (`pro: true`, deprecated) evaluated courts in a reduce whose accumulator is the best court so far; a
// request conflict returned false in place of it, and the next court threw writing to false. A refused court now leaves
// the best court found so far standing.

const scheduleDate = '2026-03-02';

it('pro scheduling skips a court a person request rules out instead of throwing', () => {
  const { tournamentRecord, venueIds } = mocksEngine.generateTournamentRecord({
    policyDefinitions: {
      [POLICY_TYPE_SCHEDULING]: {
        defaultTimes: { averageTimes: [{ minutes: { default: 90 } }], recoveryTimes: [{ minutes: { default: 0 } }] },
      },
    },
    venueProfiles: [{ courtsCount: 2, startTime: '08:00', endTime: '20:00' }],
    drawProfiles: [{ drawSize: 2 }],
    endDate: scheduleDate,
    startDate: scheduleDate,
  });
  tournamentEngine.setState(tournamentRecord);

  // the second court opens at 11:00: the first court is evaluated first and refused by the request
  const { courts } = tournamentEngine.getVenuesAndCourts();
  let result: any = tournamentEngine.modifyCourtAvailability({
    dateAvailability: [{ date: scheduleDate, startTime: '11:00', endTime: '20:00' }],
    courtId: courts[1].courtId,
  });
  expect(result.success).toEqual(true);

  const [matchUp] = tournamentEngine.allTournamentMatchUps({ inContext: true }).matchUps;
  const { participant } = tournamentEngine.findParticipant({ participantId: matchUp.sides[0].participantId });
  result = tournamentEngine.addPersonRequests({
    requests: [{ date: scheduleDate, startTime: '08:00', endTime: '10:00', requestType: DO_NOT_SCHEDULE }],
    personId: participant.person.personId,
  });
  expect(result.success).toEqual(true);

  result = tournamentEngine.setSchedulingProfile({
    schedulingProfile: [
      { scheduleDate, venues: [{ venueId: venueIds[0], rounds: tournamentEngine.getRounds().rounds }] },
    ],
  });
  expect(result.success).toEqual(true);

  result = tournamentEngine.scheduleProfileRounds({ pro: true });
  expect(result.success).toEqual(true);

  const [scheduled] = tournamentEngine.allTournamentMatchUps({ inContext: true }).matchUps;
  // pro scheduling stores the date in scheduledTime; the request covers 08:00 to 10:00
  const scheduledTime = scheduled.schedule?.scheduledTime?.split('T').reverse()[0];
  expect(scheduledTime).toBeDefined();
  expect(scheduledTime >= '10:00').toEqual(true);
});
