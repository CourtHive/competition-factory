import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants
import { UNWRITABLE_SCHEDULE_ATTRIBUTES } from '@Constants/errorConditionConstants';
import { SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { SUCCESS } from '@Constants/resultConstants';

/**
 * `addMatchUpScheduleItems` accepted any object and wrote only the attributes it
 * destructured, returning `{ success: true }` either way. Two real attributes
 * have already been lost that way — `allocatedCourts` (fixed in place) and
 * `calledAt` — so the failure mode is recurring, not hypothetical.
 *
 * The guard has to survive read-modify-write, which is a supported pattern: a
 * hydrated schedule carries a dozen keys the facade cannot write and the caller
 * cannot omit. Those are dropped in silence. Everything else is named back.
 */

const START_DATE = '2026-06-15';

function setup() {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: SINGLE_ELIMINATION, drawSize: 8 }],
    setState: true,
    startDate: START_DATE,
  });
  const { matchUps }: any = tournamentEngine.allTournamentMatchUps();
  const { matchUpId, drawId } = matchUps.find((m: any) => m.roundNumber === 1);
  return { matchUpId, drawId };
}

function warnedAttributes(result: any): string[] {
  const warning = (result.warnings ?? []).find((w: any) => w.code === UNWRITABLE_SCHEDULE_ATTRIBUTES.code);
  return warning?.attributes ?? [];
}

describe('a schedule attribute that is not written says so', () => {
  it('stays silent on a clean write', () => {
    const { matchUpId, drawId } = setup();
    const result: any = tournamentEngine.addMatchUpScheduleItems({
      matchUpId,
      drawId,
      schedule: { scheduledDate: START_DATE, scheduledTime: '10:00' },
    });
    expect(result).toMatchObject(SUCCESS);
    expect(result.warnings).toBeUndefined();
  });

  it('names a real attribute it cannot write — the class that lost calledAt', () => {
    const { matchUpId, drawId } = setup();
    const result: any = tournamentEngine.addMatchUpScheduleItems({
      matchUpId,
      drawId,
      schedule: { scheduledDate: START_DATE, official: 'someOfficialId' },
    });
    expect(result).toMatchObject(SUCCESS);
    expect(warnedAttributes(result)).toEqual(['official']);
  });

  it('names a misspelling rather than accepting it', () => {
    const { matchUpId, drawId } = setup();
    const result: any = tournamentEngine.addMatchUpScheduleItems({
      matchUpId,
      drawId,
      schedule: { scheduleDate: START_DATE, calledat: '2026-06-15T14:00:00.000Z' },
    });
    expect(warnedAttributes(result).toSorted((a, b) => a.localeCompare(b))).toEqual(['calledat', 'scheduleDate']);
  });

  it('escalates to an error, and writes nothing, when the caller asks it to', () => {
    const { matchUpId, drawId } = setup();
    const result: any = tournamentEngine.addMatchUpScheduleItems({
      matchUpId,
      drawId,
      errorOnUnknownAttributes: true,
      schedule: { scheduledDate: START_DATE, nonsense: true },
    });
    expect(result.error).toEqual(UNWRITABLE_SCHEDULE_ATTRIBUTES);
    expect(result.info).toContain('nonsense');

    const { matchUp }: any = tournamentEngine.findMatchUp({ matchUpId, drawId });
    expect(matchUp.schedule?.scheduledDate).toBeUndefined();
  });

  it('ignores an undefined value rather than reporting a key the caller did not set', () => {
    const { matchUpId, drawId } = setup();
    const result: any = tournamentEngine.addMatchUpScheduleItems({
      matchUpId,
      drawId,
      schedule: { scheduledDate: START_DATE, official: undefined },
    });
    expect(result.warnings).toBeUndefined();
  });
});

describe('read-modify-write survives the guard', () => {
  it('writes back a whole hydrated schedule without a single warning', () => {
    const { matchUpId, drawId } = setup();
    tournamentEngine.addMatchUpScheduleItems({
      matchUpId,
      drawId,
      schedule: { scheduledDate: START_DATE, scheduledTime: '10:00' },
    });

    // Every derived key the hydrator emits arrives here, unasked for and
    // unomittable — isoDateString, averageMinutes, recoveryMinutes, venueName…
    const { matchUp }: any = tournamentEngine.findMatchUp({ matchUpId, inContext: true });
    const schedule = matchUp.schedule;
    expect(Object.keys(schedule).length).toBeGreaterThan(2);

    const result: any = tournamentEngine.addMatchUpScheduleItems({ matchUpId, drawId, schedule });
    expect(result).toMatchObject(SUCCESS);
    expect(result.warnings).toBeUndefined();
  });
});
