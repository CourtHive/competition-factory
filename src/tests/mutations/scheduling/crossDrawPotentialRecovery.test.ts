import competitionEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

// Constants
import { DOUBLES, SINGLES } from '@Constants/matchUpTypes';
import { PAIR } from '@Constants/participantConstants';

// Fixtures
import POLICY_SCHEDULING_DEFAULT from '@Fixtures/policies/POLICY_SCHEDULING_DEFAULT';

const venueId = 'venue1';
const day1 = '2025-01-01';
const day2 = '2025-01-02';

// A participant whose only bookings are potential ones (here: every SINGLES R2 player, because R1 was scheduled on an
// earlier date) must still be checked against those bookings when scheduling a matchUp in ANOTHER draw.
it('does not book a potential SINGLES R2 participant into DOUBLES at the same time when R1 was on an earlier date', () => {
  // 8 individuals play SINGLES and, paired, the same 8 play DOUBLES
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount: 8, participantType: PAIR },
    eventProfiles: [
      { eventType: SINGLES, drawProfiles: [{ drawSize: 8 }] },
      { eventType: DOUBLES, drawProfiles: [{ drawSize: 4 }] },
    ],
    venueProfiles: [{ startTime: '08:00', endTime: '23:00', courtsCount: 17, venueId }],
    policyDefinitions: POLICY_SCHEDULING_DEFAULT,
    endDate: '2025-01-03',
    startDate: day1,
  });
  competitionEngine.setState(tournamentRecord);

  const { tournamentId } = tournamentRecord;
  const [singles, doubles] = tournamentRecord.events.map((event) => ({
    structureId: event.drawDefinitions[0].structures[0].structureId,
    drawId: event.drawDefinitions[0].drawId,
    eventId: event.eventId,
    tournamentId,
  }));

  const addRound = (round, roundNumber, scheduleDate) => {
    const result: any = competitionEngine.addSchedulingProfileRound({
      round: { ...round, roundNumber },
      scheduleDate,
      venueId,
    });
    expect(result.success).toEqual(true);
  };

  addRound(singles, 1, day1);
  let result: any = competitionEngine.scheduleProfileRounds({ scheduleDates: [day1] });
  expect(result.success).toEqual(true);

  addRound(singles, 2, day2);
  addRound(doubles, 1, day2);
  result = competitionEngine.scheduleProfileRounds({ scheduleDates: [day2] });
  expect(result.success).toEqual(true);

  const times = (drawId, roundNumber) =>
    competitionEngine
      .allCompetitionMatchUps({ inContext: true })
      .matchUps.filter((matchUp) => matchUp.drawId === drawId && matchUp.roundNumber === roundNumber)
      .map(({ schedule }) => schedule?.scheduledTime);

  expect(times(singles.drawId, 2)).toEqual(['08:00', '08:00']);
  // every DOUBLES player is a potential SINGLES R2 participant playing at 08:00
  const doublesR1 = times(doubles.drawId, 1);
  expect(doublesR1.length).toEqual(2);
  expect(doublesR1.every((scheduledTime) => scheduledTime && scheduledTime !== '08:00')).toEqual(true);
});
