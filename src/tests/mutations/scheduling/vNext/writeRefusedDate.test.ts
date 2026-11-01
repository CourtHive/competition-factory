import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

const DAY = '2026-10-01';
const NEXT_DAY = '2026-10-02';

function profileRoundOneOn(scheduleDate: string) {
  mocksEngine.generateTournamentRecord({
    venueProfiles: [{ venueId: 'venue-1', courtsCount: 4, startTime: '08:00', endTime: '20:00' }],
    drawProfiles: [{ drawSize: 8 }],
    startDate: DAY,
    endDate: DAY,
    setState: true,
  });
  const { tournamentRecord } = tournamentEngine.getTournament();
  const { tournamentId } = tournamentRecord;
  const { eventId, drawDefinitions } = tournamentRecord.events[0];
  const { drawId, structures } = drawDefinitions[0];
  const round = { tournamentId, eventId, drawId, structureId: structures[0].structureId, roundNumber: 1 };

  // setSchedulingProfile does not check the tournament's dates, so a profile can name a day outside them
  const result = tournamentEngine.setSchedulingProfile({
    schedulingProfile: [{ scheduleDate, venues: [{ venueId: 'venue-1', rounds: [round] }] }],
  });
  expect(result.success).toEqual(true);

  return tournamentEngine
    .allTournamentMatchUps({ matchUpFilters: { roundNumbers: [1] } })
    .matchUps.map(({ matchUpId }) => matchUpId);
}

const scheduleOf = (matchUpIds: string[]) =>
  tournamentEngine.allTournamentMatchUps({ matchUpFilters: { matchUpIds } }).matchUps.map(({ schedule }) => ({
    scheduledDate: schedule?.scheduledDate,
    scheduledTime: schedule?.scheduledTime,
  }));

it('writes no time for a placement whose date is refused, and reports it as left without a time', () => {
  const roundOneIds = profileRoundOneOn(NEXT_DAY);

  const result: any = tournamentEngine.scheduleProfileRounds({ scheduleDates: [NEXT_DAY] });
  expect(result.success).toEqual(true);

  // the date is outside the tournament, so addMatchUpScheduledDate refuses it; the time used to be written anyway
  expect(scheduleOf(roundOneIds).every(({ scheduledDate, scheduledTime }) => !scheduledDate && !scheduledTime)).toEqual(
    true,
  );
  expect(result.scheduledMatchUpIds[NEXT_DAY]).toEqual([]);
  expect([...result.noTimeMatchUpIds[NEXT_DAY]].sort()).toEqual([...roundOneIds].sort());
});

it('a date inside the tournament is written with its time, as before', () => {
  const roundOneIds = profileRoundOneOn(DAY);

  const result: any = tournamentEngine.scheduleProfileRounds({ scheduleDates: [DAY] });
  expect(result.success).toEqual(true);
  expect([...result.scheduledMatchUpIds[DAY]].sort()).toEqual([...roundOneIds].sort());
  expect(result.noTimeMatchUpIds[DAY]).toEqual([]);
  expect(
    scheduleOf(roundOneIds).every(({ scheduledDate, scheduledTime }) => scheduledDate === DAY && scheduledTime),
  ).toEqual(true);
});
