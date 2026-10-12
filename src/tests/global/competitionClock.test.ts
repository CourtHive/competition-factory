import { validateCertification } from '@Validators/officiating/validateCertification';
import { competitionToday } from '@Query/tournaments/competitionToday';
import asyncGlobalState from '@Server/providers/factory/engines/asyncGlobalState';
import { getProvider, setStateProvider } from '@Global/state/globalState';
import { isEmbargoed } from '@Query/publishing/isEmbargoed';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { afterEach, expect, it } from 'vitest';
import {
  competitionNow,
  now,
  setClock,
  setCompetitionClock,
  withCapturedClock,
  withCapturedClockAsync,
} from '@Tools/clock';

// constants
import { CONFLICTING_TIME_ZONES, INVALID_DATE, INVALID_VALUES } from '@Constants/errorConditionConstants';

/**
 * Competition time (slice 0-d.1 of Mentat/planning/COMPETITION_CLOCK_INSTRUMENTATION.md): the reads that
 * DECIDE against "now" (embargoes, live duration, eligibility "today") follow `setCompetitionClock` when one
 * is installed, while record stamps stay on `setClock`. With none installed, nothing changes.
 */
afterEach(() => {
  setCompetitionClock();
  setClock();
});

const RECORD = Date.parse('2026-05-10T12:00:00.000Z');
const COMPETITION = Date.parse('2026-05-17T15:30:00.000Z'); // 00:30 on the 18th in Tokyo
const TOKYO = 'Asia/Tokyo';

const note = (itemValue: string) => ({ timeItem: { itemType: 'NOTE', itemValue } });

it('with no provider, competition time is record time, captured instant included', () => {
  setClock(RECORD);
  expect(competitionNow().getTime()).toEqual(now().getTime());

  let reads = 0;
  setClock(() => RECORD + ++reads);
  const [record, competition] = withCapturedClock(() => [now().getTime(), competitionNow().getTime()]) as number[];
  expect(competition).toEqual(record);
  expect(reads).toEqual(1);
});

it('a provider moves the competition reads and leaves record stamps on setClock', () => {
  mocksEngine.generateTournamentRecord({ setState: true });
  setClock(RECORD);
  expect(setCompetitionClock({ nowMs: () => COMPETITION }).success).toEqual(true);

  // an embargo between the two instants: lifted on the competition clock, not on the record clock
  const embargo = new Date((RECORD + COMPETITION) / 2).toISOString();
  expect(isEmbargoed({ published: true, embargo })).toEqual(false);
  setCompetitionClock();
  expect(isEmbargoed({ published: true, embargo })).toEqual(true);

  setCompetitionClock({ nowMs: () => COMPETITION });
  expect(tournamentEngine.addTournamentTimeItem(note('a')).success).toEqual(true);
  const stamp = tournamentEngine
    .getTournament()
    .tournamentRecord.timeItems.find((item: any) => item.itemType === 'NOTE').createdAt;
  expect(stamp).toEqual(new Date(RECORD).toISOString());
});

it('an engine call reads the provider ONCE, and every competition read inside it shares that instant', () => {
  let reads = 0;
  setCompetitionClock({ nowMs: () => COMPETITION + ++reads });
  const inside = withCapturedClock(() => [competitionNow().getTime(), competitionNow().getTime()]) as number[];
  expect(reads).toEqual(1);
  expect(inside).toEqual([COMPETITION + 1, COMPETITION + 1]);
  // released: a read after the call goes to the provider again
  expect(competitionNow().getTime()).toEqual(COMPETITION + 2);
});

it('a provider that cannot answer refuses the engine call before anything is written', () => {
  mocksEngine.generateTournamentRecord({ setState: true });
  const before = JSON.stringify(tournamentEngine.getTournament().tournamentRecord);
  setCompetitionClock({ nowMs: () => Number.NaN });

  const result: any = tournamentEngine.addTournamentTimeItem(note('a'));
  expect(result.error).toEqual(INVALID_DATE);
  expect(result.message).toMatch(/competition clock/);

  setCompetitionClock();
  expect(JSON.stringify(tournamentEngine.getTournament().tournamentRecord)).toEqual(before);
});

it('a finite but unrepresentable instant is refused like a non-finite one, before any write', () => {
  mocksEngine.generateTournamentRecord({ setState: true });
  const before = JSON.stringify(tournamentEngine.getTournament().tournamentRecord);
  for (const ms of [1e20, -1e20, 8.64e15 + 1]) {
    setCompetitionClock({ nowMs: () => ms });
    const result: any = tournamentEngine.addTournamentTimeItem(note('a'));
    expect(result.error).toEqual(INVALID_DATE);
    expect(() => competitionNow()).toThrow(/invalid instant/);
  }
  setCompetitionClock();
  expect(JSON.stringify(tournamentEngine.getTournament().tournamentRecord)).toEqual(before);
  // the edge of the representable range is still an instant
  setCompetitionClock({ nowMs: () => 8.64e15 });
  expect(competitionNow().getTime()).toEqual(8.64e15);
});

it('outside an engine call a failing provider throws, and junk is refused at install', () => {
  setCompetitionClock({
    nowMs: () => {
      throw new Error('offline');
    },
  });
  expect(() => competitionNow()).toThrow(/offline/);
  expect(setCompetitionClock({} as any).error).toEqual(INVALID_VALUES);
  expect(tournamentEngine.setCompetitionClock().success).toEqual(true);
});

it("competition 'today' is the tournament's day, UTC with no zone, and a refused zone is not swapped", () => {
  setCompetitionClock({ nowMs: () => COMPETITION });
  const { tournamentRecord } = mocksEngine.generateTournamentRecord();

  expect(competitionToday()).toEqual({ date: '2026-05-17' });
  expect(competitionToday({ tournamentRecord })).toEqual({ date: '2026-05-17' });
  expect(competitionToday({ tournamentRecord: { ...tournamentRecord, localTimeZone: TOKYO } })).toEqual({
    date: '2026-05-18',
  });

  const venues = [TOKYO, 'America/New_York'].map((timeZone) => ({ venueId: timeZone, addresses: [{ timeZone }] }));
  expect(competitionToday({ tournamentRecord: { ...tournamentRecord, venues } }).error).toEqual(CONFLICTING_TIME_ZONES);
});

it("an age category's 'today' is the tournament's, not the host's", () => {
  // the last evening of the year in UTC is already next year in Tokyo, so the considered year differs
  setCompetitionClock({ nowMs: () => Date.parse('2026-12-31T15:30:00.000Z') });
  const category = { ageCategoryCode: 'U18' };

  const explicit = { category, consideredDate: '2026-06-01' };

  mocksEngine.generateTournamentRecord({ setState: true });
  const utc: any = tournamentEngine.getCategoryAgeDetails({ category });
  const explicitUtc: any = tournamentEngine.getCategoryAgeDetails(explicit);
  tournamentEngine.setTournamentLocalTimeZone({ localTimeZone: TOKYO });
  const tokyo: any = tournamentEngine.getCategoryAgeDetails({ category });

  expect(utc.ageMinDate?.slice(0, 4)).toEqual('2008');
  expect(tokyo.ageMinDate?.slice(0, 4)).toEqual('2009');
  // an explicit consideredDate still wins, whatever the zone
  expect((tournamentEngine.getCategoryAgeDetails(explicit) as any).ageMinDate).toEqual(explicitUtc.ageMinDate);
});

it('certification eligibility reads the competition clock, not the record clock', () => {
  setClock(RECORD);
  setCompetitionClock({ nowMs: () => COMPETITION });
  const officialRecord: any = {
    certifications: [{ certificationId: 'c1', status: 'ACTIVE', validUntil: '2026-05-12' }],
  };
  const result: any = validateCertification({ officialRecord, certificationId: 'c1' });
  expect(result.valid).toEqual(false);
  setCompetitionClock();
  expect((validateCertification({ officialRecord, certificationId: 'c1' }) as any).valid).toEqual(true);
});

it('overlapping async requests each keep their own competition instant', async () => {
  const previous = getProvider();
  setStateProvider(asyncGlobalState);
  try {
    let reads = 0;
    setCompetitionClock({ nowMs: () => COMPETITION + ++reads * 1000 });
    const request = (delay: number) =>
      asyncGlobalState.runWithInstanceState(() =>
        withCapturedClockAsync(async () => {
          const first = competitionNow().getTime();
          await new Promise((resolve) => setTimeout(resolve, delay));
          return { first, last: competitionNow().getTime() };
        }),
      );
    const [slow, fast]: any[] = await Promise.all([request(20), request(1)]);
    expect(slow.last).toEqual(slow.first);
    expect(fast.last).toEqual(fast.first);
    expect(fast.first).not.toEqual(slow.first);
  } finally {
    setStateProvider(previous);
  }
});
