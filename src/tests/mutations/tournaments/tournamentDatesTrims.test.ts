import { setSubscriptions, deleteNotices } from '@Global/state/globalState';
import { afterEach, describe, expect, it } from 'vitest';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';

// constants
import { MODIFY_EVENT, MODIFY_SCHEDULING_PROFILE, MODIFY_TOURNAMENT_DETAIL } from '@Constants/topicConstants';

// When the tournament's range changes, setTournamentDates removes what lies outside the new ranges:
// scheduling-profile dates, the tournament's active dates and each event's active dates.

const startDate = '2025-06-02';
const endDate = '2025-06-06';
const days = ['2025-06-02', '2025-06-03', '2025-06-04', '2025-06-05', '2025-06-06'];
const eventId = 'event';

function seed() {
  const {
    venueIds: [venueId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 32, eventId }],
    venueProfiles: [{ courtsCount: 4 }],
    tournamentAttributes: { startDate, endDate },
    setState: true,
  });
  const rounds = tournamentEngine.getRounds().rounds;
  // one round per day
  const schedulingProfile = days.map((scheduleDate, i) => ({
    scheduleDate,
    venues: [{ venueId, rounds: [rounds[i]] }],
  }));
  let result: any = tournamentEngine.setSchedulingProfile({ schedulingProfile });
  expect(result.success).toEqual(true);
  expect(result.warnings).toBeUndefined();

  const captured: Record<string, any[]> = { profile: [], event: [], detail: [] };
  setSubscriptions({
    subscriptions: {
      [MODIFY_SCHEDULING_PROFILE]: (payloads: any[]) => captured.profile.push(...payloads),
      [MODIFY_EVENT]: (payloads: any[]) => captured.event.push(...payloads),
      [MODIFY_TOURNAMENT_DETAIL]: (payloads: any[]) => captured.detail.push(...payloads),
    },
  });
  deleteNotices();
  return { venueId, rounds, captured, tournamentId: tournamentRecord.tournamentId };
}

const profileDates = () => tournamentEngine.getSchedulingProfile().schedulingProfile.map((d: any) => d.scheduleDate);
const tournamentActiveDates = () => tournamentEngine.getTournament().tournamentRecord.activeDates;
const eventActiveDates = () => tournamentEngine.getEvent({ eventId }).event.activeDates;

afterEach(() => {
  setSubscriptions({ subscriptions: {} });
  deleteNotices();
});

describe('setTournamentDates trims the scheduling profile to the new range', () => {
  it('extend: nothing is trimmed and the profile is not re-saved', () => {
    const { captured } = seed();
    let result: any = tournamentEngine.setTournamentDates({ startDate: '2025-06-01', endDate: '2025-06-09' });
    expect(result.success).toEqual(true);
    expect(result.trimmedSchedulingProfile).toBeUndefined();
    expect(result.activeDateChanges).toBeUndefined();
    expect(profileDates()).toEqual(days);
    expect(captured.profile).toEqual([]);
  });

  it('shrink: dates outside the new range leave the profile, reported with their rounds', () => {
    const { captured, venueId, rounds, tournamentId } = seed();
    let result: any = tournamentEngine.setTournamentDates({ startDate: '2025-06-03', endDate: '2025-06-05' });
    expect(result.success).toEqual(true);

    expect(result.trimmedSchedulingProfile).toEqual([
      { scheduleDate: '2025-06-02', venues: [{ venueId, rounds: [rounds[0]] }] },
      { scheduleDate: '2025-06-06', venues: [{ venueId, rounds: [rounds[4]] }] },
    ]);
    expect(profileDates()).toEqual(['2025-06-03', '2025-06-04', '2025-06-05']);

    expect(captured.profile).toHaveLength(1);
    expect(captured.profile[0].tournamentId).toEqual(tournamentId);
    expect(captured.profile[0].schedulingProfile.map((d: any) => d.scheduleDate)).toEqual(profileDates());

    // the trimmed rounds are simply no longer profiled: scheduling the profile places none of their matchUps
    result = tournamentEngine.scheduleProfileRounds();
    expect(result.success).toEqual(true);
    const scheduledDates = new Set<string>(
      tournamentEngine
        .allTournamentMatchUps()
        .matchUps.map((m: any) => m.schedule?.scheduledDate)
        .filter(Boolean),
    );
    expect([...scheduledDates].sort()).toEqual(['2025-06-03', '2025-06-04', '2025-06-05']);
  });

  it('shift: only the dates before the new start are trimmed', () => {
    const { venueId, rounds } = seed();
    let result: any = tournamentEngine.setTournamentDates({ startDate: '2025-06-04', endDate: '2025-06-08' });
    expect(result.success).toEqual(true);
    expect(result.trimmedSchedulingProfile).toEqual([
      { scheduleDate: '2025-06-02', venues: [{ venueId, rounds: [rounds[0]] }] },
      { scheduleDate: '2025-06-03', venues: [{ venueId, rounds: [rounds[1]] }] },
    ]);
    expect(profileDates()).toEqual(['2025-06-04', '2025-06-05', '2025-06-06']);
  });

  it('setTournamentEndDate trims too', () => {
    seed();
    let result: any = tournamentEngine.setTournamentEndDate({ endDate: '2025-06-04' });
    expect(result.success).toEqual(true);
    expect(result.trimmedSchedulingProfile.map((d: any) => d.scheduleDate)).toEqual(['2025-06-05', '2025-06-06']);
    expect(profileDates()).toEqual(['2025-06-02', '2025-06-03', '2025-06-04']);
  });

  it('a call that does not change the range trims nothing', () => {
    seed();
    let result: any = tournamentEngine.setSchedulingProfile({
      schedulingProfile: [
        ...tournamentEngine.getSchedulingProfile().schedulingProfile,
        { scheduleDate: '2025-06-09', venues: [] },
      ],
    });
    expect(result.success).toEqual(true);
    result = tournamentEngine.setTournamentDates({ weekdays: ['MON', 'TUE', 'WED', 'THU', 'FRI'] });
    expect(result.success).toEqual(true);
    expect(result.trimmedSchedulingProfile).toBeUndefined();
    expect(profileDates()).toEqual([...days, '2025-06-09']);
  });
});

describe('setTournamentDates prunes active dates outside the new ranges', () => {
  it('extend: nothing is pruned', () => {
    seed();
    let result: any = tournamentEngine.setTournamentDates({ activeDates: ['2025-06-02', '2025-06-04'] });
    expect(result.success).toEqual(true);
    result = tournamentEngine.setTournamentDates({ endDate: '2025-06-10' });
    expect(result.activeDateChanges).toBeUndefined();
    expect(tournamentActiveDates()).toEqual(['2025-06-02', '2025-06-04']);
  });

  it("shrink: the tournament's and an event's lists keep only dates inside the new ranges", () => {
    const { captured } = seed();
    let result: any = tournamentEngine.setTournamentDates({ activeDates: ['2025-06-02', '2025-06-04', '2025-06-06'] });
    expect(result.success).toEqual(true);
    result = tournamentEngine.setEventDates({ eventId, activeDates: ['2025-06-03', '2025-06-05', '2025-06-06'] });
    expect(result.success).toEqual(true);
    captured.event.length = 0;
    captured.detail.length = 0;

    result = tournamentEngine.setTournamentDates({ startDate: '2025-06-03', endDate: '2025-06-05' });
    expect(result.success).toEqual(true);
    expect(result.activeDateChanges).toEqual([
      {
        previousActiveDates: ['2025-06-02', '2025-06-04', '2025-06-06'],
        prunedActiveDates: ['2025-06-02', '2025-06-06'],
        activeDates: ['2025-06-04'],
      },
      {
        eventId,
        previousActiveDates: ['2025-06-03', '2025-06-05', '2025-06-06'],
        prunedActiveDates: ['2025-06-06'],
        activeDates: ['2025-06-03', '2025-06-05'],
      },
    ]);
    expect(tournamentActiveDates()).toEqual(['2025-06-04']);
    expect(eventActiveDates()).toEqual(['2025-06-03', '2025-06-05']);

    expect(captured.event.some(({ event }) => event.eventId === eventId)).toEqual(true);
    expect(captured.detail.at(-1).activeDates).toEqual(['2025-06-04']);
  });

  it("an event's list is judged against the event's own (reconciled) range", () => {
    seed();
    let result: any = tournamentEngine.setEventDates({
      eventId,
      startDate: '2025-06-02',
      endDate: '2025-06-04',
      activeDates: ['2025-06-02', '2025-06-04'],
    });
    expect(result.success).toEqual(true);

    // the event's range is CLAMPED to 06-03..06-04, so 06-02 leaves its list
    result = tournamentEngine.setTournamentDates({ startDate: '2025-06-03' });
    expect(result.success).toEqual(true);
    expect(result.eventDateChanges).toEqual([expect.objectContaining({ eventId, reason: 'CLAMPED' })]);
    expect(result.activeDateChanges).toEqual([
      {
        eventId,
        previousActiveDates: ['2025-06-02', '2025-06-04'],
        prunedActiveDates: ['2025-06-02'],
        activeDates: ['2025-06-04'],
      },
    ]);
    expect(eventActiveDates()).toEqual(['2025-06-04']);
  });

  it('a list left empty is unset and reported without activeDates', () => {
    const { captured } = seed();
    let result: any = tournamentEngine.setTournamentDates({ activeDates: ['2025-06-02'] });
    expect(result.success).toEqual(true);
    result = tournamentEngine.setEventDates({ eventId, activeDates: ['2025-06-02', '2025-06-03'] });
    expect(result.success).toEqual(true);
    captured.event.length = 0;
    captured.detail.length = 0;

    result = tournamentEngine.setTournamentDates({ startDate: '2025-06-04' });
    expect(result.success).toEqual(true);
    expect(result.activeDateChanges).toEqual([
      { previousActiveDates: ['2025-06-02'], prunedActiveDates: ['2025-06-02'] },
      { eventId, previousActiveDates: ['2025-06-02', '2025-06-03'], prunedActiveDates: ['2025-06-02', '2025-06-03'] },
    ]);
    expect(tournamentActiveDates()).toBeUndefined();
    expect(eventActiveDates()).toBeUndefined();
    expect(captured.event.some(({ event }) => event.eventId === eventId)).toEqual(true);
    // the notice says the list is now empty (unset)
    expect(captured.detail.at(-1).activeDates).toEqual([]);
  });
});

describe('competition: rounds of another tournament stay on its dates', () => {
  it("trims only this tournament's rounds from a date outside its range", () => {
    const first = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8 }],
      venueProfiles: [{ venueId: 'shared', courtsCount: 4 }],
      tournamentAttributes: { tournamentId: 'first', startDate, endDate },
    }).tournamentRecord;
    const second = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8 }],
      tournamentAttributes: { tournamentId: 'second', startDate, endDate: '2025-06-10' },
    }).tournamentRecord;
    second.venues = first.venues;
    tournamentEngine.setState([first, second]);
    const rounds = tournamentEngine.getRounds().rounds;
    const firstRound = rounds.find((r: any) => r.tournamentId === 'first');
    const secondRound = rounds.find((r: any) => r.tournamentId === 'second');
    tournamentEngine.setTournamentId('first');
    let result: any = tournamentEngine.setSchedulingProfile({
      schedulingProfile: [
        { scheduleDate: '2025-06-06', venues: [{ venueId: 'shared', rounds: [firstRound, secondRound] }] },
      ],
    });
    expect(result.success).toEqual(true);

    result = tournamentEngine.setTournamentDates({ endDate: '2025-06-05' });
    expect(result.success).toEqual(true);
    expect(result.trimmedSchedulingProfile).toEqual([
      { scheduleDate: '2025-06-06', venues: [{ venueId: 'shared', rounds: [firstRound] }] },
    ]);
    const stored = tournamentEngine.getTournament().tournamentRecord.scheduling?.profile ?? [];
    const storedRounds = stored.flatMap((d: any) => d.venues.flatMap((v: any) => v.rounds));
    expect(storedRounds.map((r: any) => r.tournamentId)).toEqual(['second']);
  });
});
