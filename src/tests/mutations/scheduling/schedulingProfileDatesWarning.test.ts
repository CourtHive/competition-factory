import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants
import { INVALID_DATE, SCHEDULING_PROFILE_DATES_OUT_OF_RANGE } from '@Constants/errorConditionConstants';

const START = '2026-03-02';
const END = '2026-03-04';

function setup() {
  const { tournamentRecord, drawIds, venueIds } = mocksEngine.generateTournamentRecord({
    venueProfiles: [{ courtsCount: 4 }],
    drawProfiles: [{ drawSize: 8 }],
    startDate: START,
    endDate: END,
  });
  tournamentEngine.setState(tournamentRecord);
  const rounds = (tournamentEngine.getRounds().rounds ?? []).filter((round: any) => round.drawId === drawIds[0]);
  return { venueId: venueIds[0], rounds };
}

const dateProfile = (scheduleDate: string, venueId: string, rounds: any[] = []) => ({
  scheduleDate,
  venues: [{ venueId, rounds }],
});

const storedDates = () => tournamentEngine.getSchedulingProfile().schedulingProfile.map((d: any) => d.scheduleDate);

describe('setSchedulingProfile: profile dates outside the tournament dates', () => {
  it('saves an in-range profile with no warning', () => {
    const { venueId, rounds } = setup();
    const result: any = tournamentEngine.setSchedulingProfile({
      schedulingProfile: [dateProfile(START, venueId, [rounds[0]]), dateProfile(END, venueId, [rounds[1]])],
    });
    expect(result.success).toEqual(true);
    expect(result.warnings).toBeUndefined();
  });

  it('saves an out-of-range profile and warns, naming the out-of-range dates', () => {
    const { venueId, rounds } = setup();
    const result: any = tournamentEngine.setSchedulingProfile({
      schedulingProfile: [
        dateProfile('2026-03-01', venueId, [rounds[0]]),
        dateProfile(START, venueId, [rounds[1]]),
        dateProfile('2026-03-05', venueId, [rounds[2]]),
      ],
    });
    expect(result.success).toEqual(true);
    expect(result.warnings).toEqual([
      { ...SCHEDULING_PROFILE_DATES_OUT_OF_RANGE, scheduleDates: ['2026-03-01', '2026-03-05'] },
    ]);
    // not refused: the whole profile is stored
    expect(storedDates()).toEqual(['2026-03-01', START, '2026-03-05']);
  });

  it('compares calendar days: a datetime on the last day is in range', () => {
    const { venueId, rounds } = setup();
    const result: any = tournamentEngine.setSchedulingProfile({
      schedulingProfile: [dateProfile(`${END}T23:00:00`, venueId, [rounds[0]])],
    });
    expect(result.success).toEqual(true);
    expect(result.warnings).toBeUndefined();
  });

  it('warns through executionQueue', () => {
    const { venueId } = setup();
    const result: any = tournamentEngine.executionQueue([
      { method: 'setSchedulingProfile', params: { schedulingProfile: [dateProfile('2026-03-09', venueId)] } },
    ]);
    expect(result.success).toEqual(true);
    expect(result.results[0].warnings?.[0]).toMatchObject({
      code: SCHEDULING_PROFILE_DATES_OUT_OF_RANGE.code,
      scheduleDates: ['2026-03-09'],
    });
  });

  it('addSchedulingProfileRound still refuses a new out-of-range date, and passes on the warning for stored ones', () => {
    const { venueId, rounds } = setup();
    let result: any = tournamentEngine.addSchedulingProfileRound({
      scheduleDate: '2026-03-05',
      round: rounds[0],
      venueId,
    });
    expect(result.error).toEqual(INVALID_DATE);

    result = tournamentEngine.setSchedulingProfile({
      schedulingProfile: [dateProfile('2026-03-05', venueId, [rounds[0]])],
    });
    expect(result.warnings?.[0].scheduleDates).toEqual(['2026-03-05']);

    // an in-range round added beside the stored out-of-range date: saved, and the stored date is reported
    result = tournamentEngine.addSchedulingProfileRound({ scheduleDate: START, round: rounds[1], venueId });
    expect(result.success).toEqual(true);
    expect(result.warnings).toEqual([{ ...SCHEDULING_PROFILE_DATES_OUT_OF_RANGE, scheduleDates: ['2026-03-05'] }]);
  });
});
