import { matchUpDuration } from '@Query/matchUp/matchUpDuration';
import { setClock, setCompetitionClock } from '@Tools/clock';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// constants
import { START_TIME, STOP_TIME, RESUME_TIME, END_TIME, SCHEDULED_DATE, END_DATE } from '@Constants/timeItemConstants';

const COMPETITION = Date.parse('2026-05-17T12:00:00Z');
const HOUR = 60 * 60 * 1000;
const ORIGINAL_TZ = process.env.TZ;

// A bare HH:MM is read as process-local wall time on the UTC reference day, so every expectation
// below holds only in UTC. The zone travels with the file rather than with the runner: without it
// these fail on a UTC-4 developer machine while CI (UTC) stays green.
beforeEach(() => {
  process.env.TZ = 'UTC';
});

afterEach(() => {
  setCompetitionClock();
  setClock();
  // assigning undefined would store the string 'undefined'
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

describe('matchUpDuration competition clock', () => {
  it.each(['2026-05-10T12:00:00Z', '2026-05-24T12:00:00Z'])(
    'anchors a live bare start to the competition date when record time is %s',
    (recordTime) => {
      setClock(recordTime);
      setCompetitionClock({ nowMs: () => COMPETITION });

      let result: any = matchUpDuration({
        matchUp: { timeItems: [{ itemType: START_TIME, itemValue: '10:00' }] },
      });

      expect(result.milliseconds).toEqual(2 * HOUR);
      expect(result.time).toEqual('02:00:00');
    },
  );

  it('adds completed playing intervals to the live interval after a bare-time resume', () => {
    setClock('2026-05-10T12:00:00Z');
    setCompetitionClock({ nowMs: () => COMPETITION });

    let result: any = matchUpDuration({
      matchUp: {
        timeItems: [
          { itemType: START_TIME, itemValue: '08:00' },
          { itemType: STOP_TIME, itemValue: '08:30' },
          { itemType: RESUME_TIME, itemValue: '10:00' },
        ],
      },
    });

    expect(result.milliseconds).toEqual(2.5 * HOUR);
    expect(result.time).toEqual('02:30:00');
  });

  it('uses one competition read even when called directly with a moving provider', () => {
    setClock('2026-05-10T12:00:00Z');
    let reads = 0;
    setCompetitionClock({ nowMs: () => COMPETITION + reads++ * HOUR });

    let result: any = matchUpDuration({
      matchUp: { timeItems: [{ itemType: START_TIME, itemValue: '10:00' }] },
    });

    expect(reads).toEqual(1);
    expect(result.milliseconds).toEqual(2 * HOUR);
  });

  it('anchors a bare start to the competition day just after UTC midnight', () => {
    setClock('2026-05-10T12:00:00Z');
    setCompetitionClock({ nowMs: () => Date.parse('2026-05-18T00:30:00Z') });

    let result: any = matchUpDuration({
      matchUp: { timeItems: [{ itemType: START_TIME, itemValue: '00:15' }] },
    });

    expect(result.milliseconds).toEqual(15 * 60 * 1000);
  });

  it('preserves an explicit ISO start across midnight instead of projecting it onto today', () => {
    setClock('2026-05-10T12:00:00Z');
    setCompetitionClock({ nowMs: () => Date.parse('2026-05-18T00:30:00Z') });

    let result: any = matchUpDuration({
      matchUp: { timeItems: [{ itemType: START_TIME, itemValue: '2026-05-17T23:30:00Z' }] },
    });

    expect(result.milliseconds).toEqual(HOUR);
  });

  it('keeps a completed ISO duration independent of either current clock date', () => {
    setClock('2026-05-10T12:00:00Z');
    setCompetitionClock({ nowMs: () => COMPETITION });

    let result: any = matchUpDuration({
      matchUp: {
        timeItems: [
          { itemType: START_TIME, itemValue: '2025-03-09T06:30:00Z' },
          { itemType: END_TIME, itemValue: '2025-03-09T08:30:00Z' },
        ],
      },
    });

    expect(result.milliseconds).toEqual(2 * HOUR);
  });

  it.each(['native', 'legacy'])('preserves explicit cross-midnight date separation in %s records', (shape) => {
    setClock('2026-05-10T12:00:00Z');
    setCompetitionClock({ nowMs: () => COMPETITION });

    const dates = { scheduledDate: '2025-07-11', endDate: '2025-07-12' };
    const timeItems = [
      { itemType: START_TIME, itemValue: '21:00' },
      { itemType: END_TIME, itemValue: '00:23' },
      ...(shape === 'legacy'
        ? [
            { itemType: SCHEDULED_DATE, itemValue: dates.scheduledDate },
            { itemType: END_DATE, itemValue: dates.endDate },
          ]
        : []),
    ];

    let result: any = matchUpDuration({
      matchUp: { timeItems, ...(shape === 'native' ? { schedule: dates } : {}) },
    });

    expect(result.milliseconds).toEqual((3 * 60 + 23) * 60 * 1000);
    expect(result.time).toEqual('03:23:00');
  });

  it('inherits the record clock when no separate competition provider is installed', () => {
    setClock(COMPETITION);

    let result: any = matchUpDuration({
      matchUp: { timeItems: [{ itemType: START_TIME, itemValue: '10:00' }] },
    });

    expect(result.milliseconds).toEqual(2 * HOUR);
  });
});
