import { hasSchedule } from '@Query/matchUp/hasSchedule';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

const startDate = '2022-09-24';
const nextDate = '2022-09-25';
const undatedAvailability = [{ startTime: '08:00', endTime: '12:00' }];

// two courts that hold only an undated availability, which applies on every date
function setup() {
  mocksEngine.generateTournamentRecord({
    venueProfiles: [{ venueId: 'v1', courtsCount: 2 }],
    drawProfiles: [{ drawSize: 32 }],
    endDate: '2022-09-28',
    setState: true,
    startDate,
  });
  const courtIds = tournamentEngine.getVenuesAndCourts().courts.map(({ courtId }) => courtId);
  for (const courtId of courtIds) {
    const result: any = tournamentEngine.modifyCourtAvailability({ dateAvailability: undatedAvailability, courtId });
    expect(result.success).toEqual(true);
  }
  return courtIds;
}

function scheduledOn(scheduleDate: string) {
  const matchUpIds = tournamentEngine.allTournamentMatchUps().matchUps.map(({ matchUpId }) => matchUpId);
  const result: any = tournamentEngine.scheduleMatchUps({ scheduleDate, matchUpIds });
  expect(result.success).toEqual(true);
  return tournamentEngine.allTournamentMatchUps().matchUps.filter(hasSchedule).length;
}

describe('a court disabled on some dates', () => {
  it('keeps its undated availability on every other date', () => {
    const [courtA, courtB] = setup();
    const result: any = tournamentEngine.disableCourts({ courtIds: [courtA], dates: [startDate] });
    expect(result.success).toEqual(true);

    const courts = tournamentEngine.getVenuesAndCourts({ ignoreDisabled: true, dates: [nextDate] }).courts;
    const availabilityOf = (courtId: string) => courts.find((court) => court.courtId === courtId)?.dateAvailability;
    // resolved onto the date asked about
    expect(availabilityOf(courtA)).toEqual([{ ...undatedAvailability[0], date: nextDate }]);
    expect(availabilityOf(courtB)).toEqual(undatedAvailability);

    // and is not offered on the date it is disabled
    const onDisabledDate = tournamentEngine.getVenuesAndCourts({ ignoreDisabled: true, dates: [startDate] }).courts;
    expect(onDisabledDate.map(({ courtId }) => courtId)).toEqual([courtB]);
  });

  it('schedules as many matchUps on another date as a court never disabled', () => {
    setup();
    const control = scheduledOn(nextDate);

    const [courtA] = setup();
    const result: any = tournamentEngine.disableCourts({ courtIds: [courtA], dates: [startDate] });
    expect(result.success).toEqual(true);
    expect(scheduledOn(nextDate)).toEqual(control);
  });

  it('lists dated entries first, then one undated entry per date asked, none for a date with a dated entry', () => {
    const [courtA] = setup();
    const dated = { date: '2022-09-26', startTime: '10:00', endTime: '11:00' };
    const disabledDated = { date: startDate, startTime: '09:00', endTime: '10:00' };
    let result: any = tournamentEngine.modifyCourtAvailability({
      dateAvailability: [...undatedAvailability, dated, disabledDated],
      courtId: courtA,
    });
    expect(result.success).toEqual(true);
    result = tournamentEngine.disableCourts({ courtIds: [courtA], dates: [startDate] });
    expect(result.success).toEqual(true);

    const asked = ['2022-09-27', '2022-09-26', nextDate];
    const courts = tournamentEngine.getVenuesAndCourts({ ignoreDisabled: true, dates: asked }).courts;
    const availability = courts.find((court) => court.courtId === courtA)?.dateAvailability;
    // the dated entry kept (the one on the disabled date dropped), then the undated hours on each date asked that has
    // no dated entry, in the order asked
    expect(availability).toEqual([
      dated,
      { ...undatedAvailability[0], date: '2022-09-27' },
      { ...undatedAvailability[0], date: nextDate },
    ]);
  });
});
