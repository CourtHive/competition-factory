import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants
import { INVALID_DATE, INVALID_VALUES } from '@Constants/errorConditionConstants';
import { SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { SUCCESS } from '@Constants/resultConstants';

/**
 * A matchUp cannot be called to court before the tournament opens.
 *
 * Found from the other end: a production tournament whose first day was still a
 * day away displayed a call time on every matchUp in its draw. That particular
 * symptom was a TMX rendering defect (a formatter that substituted "now" for an
 * absent stamp), but it exposed that the factory itself would have accepted such
 * a stamp without complaint — `setMatchUpCalledAt` validated only that the value
 * was a string. `addMatchUpScheduledDate` has always refused a `scheduledDate`
 * outside the tournament's range; a call to court predating the start is the
 * same impossibility and is now refused the same way.
 *
 * `setMatchUpCalledAt` is the single write path — `addMatchUpScheduleItems`
 * delegates to it — so both facades are exercised here.
 */

const START_DATE = '2026-06-15';
const END_DATE = '2026-06-20';

function setup({ localTimeZone }: { localTimeZone?: string } = {}) {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: SINGLE_ELIMINATION, drawSize: 8 }],
    endDate: END_DATE,
    startDate: START_DATE,
    setState: true,
  });
  // `generateTournamentRecord` does not thread `localTimeZone`, so it is set
  // through the governor method a TD's Edit Dates modal would use.
  if (localTimeZone) expect(tournamentEngine.setTournamentLocalTimeZone({ localTimeZone })).toEqual(SUCCESS);
  const { matchUps }: any = tournamentEngine.allTournamentMatchUps();
  const { matchUpId, drawId } = matchUps.find((m: any) => m.roundNumber === 1);
  return { matchUpId, drawId };
}

/** Raw read — proves nothing was written, not merely that an error was returned. */
function storedCalledAt(matchUpId: string, drawId: string) {
  const { drawDefinition }: any = tournamentEngine.getEvent({ drawId });
  for (const structure of drawDefinition?.structures ?? []) {
    const found = (structure.matchUps ?? []).find((m: any) => m.matchUpId === matchUpId);
    if (found) return found.schedule?.calledAt;
  }
  return undefined;
}

describe('calledAt cannot precede the tournament startDate', () => {
  it('rejects a 21:02 call the evening before the start — the reported scenario, exactly', () => {
    // The production sighting: a tournament whose first day was still a day away
    // showed 21:02 against every matchUp. Stamped for real, that is what it would
    // have been — 21:02 venue-local on 2026-06-14, the night before a 06-15 start.
    const { matchUpId, drawId } = setup({ localTimeZone: 'America/New_York' });
    const result: any = tournamentEngine.setMatchUpCalledAt({
      calledAt: '2026-06-15T01:02:00.000Z', // 2026-06-14 21:02 in New York
      matchUpId,
      drawId,
    });
    expect(result.error).toEqual(INVALID_DATE);
    expect(result.info).toContain('startDate');
    expect(storedCalledAt(matchUpId, drawId)).toBeUndefined();
  });

  it('rejects a call stamped well before the tournament starts', () => {
    const { matchUpId, drawId } = setup();
    const result: any = tournamentEngine.setMatchUpCalledAt({
      calledAt: '2026-05-01T14:00:00.000Z',
      matchUpId,
      drawId,
    });
    expect(result.error).toEqual(INVALID_DATE);
    expect(storedCalledAt(matchUpId, drawId)).toBeUndefined();
  });

  it('rejects through addMatchUpScheduleItems too — the batch facade must not be a side door', () => {
    const { matchUpId, drawId } = setup();
    const result: any = tournamentEngine.addMatchUpScheduleItems({
      schedule: { calledAt: '2026-06-01T14:00:00.000Z' },
      matchUpId,
      drawId,
    });
    expect(result.error).toEqual(INVALID_DATE);
    expect(storedCalledAt(matchUpId, drawId)).toBeUndefined();
  });

  it('accepts a call on the opening day itself', () => {
    const { matchUpId, drawId } = setup();
    const calledAt = '2026-06-15T14:00:00.000Z';
    expect(tournamentEngine.setMatchUpCalledAt({ calledAt, matchUpId, drawId })).toEqual(SUCCESS);
    expect(storedCalledAt(matchUpId, drawId)).toEqual(calledAt);
  });

  it('accepts a call on a later tournament day', () => {
    const { matchUpId, drawId } = setup();
    const calledAt = '2026-06-18T14:00:00.000Z';
    expect(tournamentEngine.setMatchUpCalledAt({ calledAt, matchUpId, drawId })).toEqual(SUCCESS);
    expect(storedCalledAt(matchUpId, drawId)).toEqual(calledAt);
  });

  it('still clears with null, which carries no date to validate', () => {
    const { matchUpId, drawId } = setup();
    tournamentEngine.setMatchUpCalledAt({ calledAt: '2026-06-16T14:00:00.000Z', matchUpId, drawId });
    expect(tournamentEngine.setMatchUpCalledAt({ calledAt: null, matchUpId, drawId })).toEqual(SUCCESS);
    expect(storedCalledAt(matchUpId, drawId)).toBeUndefined();
  });

  it('rejects an unparseable stamp rather than storing one the guard cannot check', () => {
    const { matchUpId, drawId } = setup();
    const result: any = tournamentEngine.setMatchUpCalledAt({ calledAt: 'not-a-date', matchUpId, drawId });
    expect(result.error).toEqual(INVALID_DATE);
    expect(storedCalledAt(matchUpId, drawId)).toBeUndefined();
  });

  it('still rejects a non-string before it ever reaches the date guard', () => {
    const { matchUpId, drawId } = setup();
    const result: any = tournamentEngine.setMatchUpCalledAt({ calledAt: 1234, matchUpId, drawId });
    expect(result.error).toEqual(INVALID_VALUES);
  });
});

/**
 * The zone half of the guard. `startDate` is a venue-local calendar day and
 * `calledAt` is a UTC instant, so a comparison that ignores the zone gets the
 * opening day wrong in both directions — and the direction that matters most is
 * the FALSE REJECTION, which would block a real running desk.
 */
describe('the start-date comparison is made on the venue clock', () => {
  it('accepts a Sydney morning call whose UTC day is still the day before the start', () => {
    // 2026-06-15 09:00 in Sydney (UTC+10) is 2026-06-14T23:00Z. Compared as a
    // UTC day that reads as the day BEFORE the tournament opens, yet it is
    // 09:00 on opening morning at the venue and must be accepted.
    const { matchUpId, drawId } = setup({ localTimeZone: 'Australia/Sydney' });
    const calledAt = '2026-06-14T23:00:00.000Z';
    expect(tournamentEngine.setMatchUpCalledAt({ calledAt, matchUpId, drawId })).toEqual(SUCCESS);
    expect(storedCalledAt(matchUpId, drawId)).toEqual(calledAt);
  });

  it('rejects a Sydney call that is genuinely the evening before the start', () => {
    // 2026-06-14T09:00Z is 19:00 on 2026-06-14 in Sydney — the night before.
    const { matchUpId, drawId } = setup({ localTimeZone: 'Australia/Sydney' });
    const result: any = tournamentEngine.setMatchUpCalledAt({
      calledAt: '2026-06-14T09:00:00.000Z',
      matchUpId,
      drawId,
    });
    expect(result.error).toEqual(INVALID_DATE);
    expect(storedCalledAt(matchUpId, drawId)).toBeUndefined();
  });

  it('accepts a New York evening call whose UTC day has already rolled to the next day', () => {
    // 2026-06-15 21:02 in New York (UTC-4) is 2026-06-16T01:02Z — after the
    // start either way, but it pins that the zone shift is applied, not assumed.
    const { matchUpId, drawId } = setup({ localTimeZone: 'America/New_York' });
    const calledAt = '2026-06-16T01:02:00.000Z';
    expect(tournamentEngine.setMatchUpCalledAt({ calledAt, matchUpId, drawId })).toEqual(SUCCESS);
    expect(storedCalledAt(matchUpId, drawId)).toEqual(calledAt);
  });

  it('rejects a New York call on the calendar day before the start', () => {
    const { matchUpId, drawId } = setup({ localTimeZone: 'America/New_York' });
    const result: any = tournamentEngine.setMatchUpCalledAt({
      calledAt: '2026-06-14T18:00:00.000Z',
      matchUpId,
      drawId,
    });
    expect(result.error).toEqual(INVALID_DATE);
  });

  it('falls back to the UTC+14 bound when the tournament names no zone', () => {
    // No localTimeZone and no venue address: the venue-local day is genuinely
    // unknowable, so only a bound can be asserted. Local midnight opening the
    // tournament is no earlier than 2026-06-14T10:00Z (UTC+14). An instant before
    // that is before the start everywhere on earth and is refused; one after it is
    // opening day SOMEWHERE and must be admitted, because refusing a real call to
    // court stops play.
    const { matchUpId, drawId } = setup();
    const admissible = '2026-06-14T11:00:00.000Z'; // 2026-06-15 01:00 at UTC+14
    expect(tournamentEngine.setMatchUpCalledAt({ calledAt: admissible, matchUpId, drawId })).toEqual(SUCCESS);

    const impossibleAnywhere: any = tournamentEngine.setMatchUpCalledAt({
      calledAt: '2026-06-14T09:00:00.000Z', // still 06-14 even at UTC+14
      matchUpId,
      drawId,
    });
    expect(impossibleAnywhere.error).toEqual(INVALID_DATE);
  });

  it('a zone turns the same evening-before stamp from admitted into refused', () => {
    // The upgrade this guard gets from `localTimeZone`, pinned as a pair so the
    // weakness of the zone-less bound is documented by behaviour, not by prose.
    const eveningBefore = '2026-06-15T01:02:00.000Z'; // 2026-06-14 21:02 in New York

    const zoneless = setup();
    expect(tournamentEngine.setMatchUpCalledAt({ calledAt: eveningBefore, ...zoneless })).toEqual(SUCCESS);

    const zoned = setup({ localTimeZone: 'America/New_York' });
    const result: any = tournamentEngine.setMatchUpCalledAt({ calledAt: eveningBefore, ...zoned });
    expect(result.error).toEqual(INVALID_DATE);
  });
});
