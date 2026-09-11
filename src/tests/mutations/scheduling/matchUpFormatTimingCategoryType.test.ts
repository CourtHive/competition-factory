import { getEventMatchUpFormatTiming } from '@Query/extensions/matchUpFormatTiming/getEventMatchUpFormatTiming';
import { getMatchUpFormatTiming } from '@Query/extensions/matchUpFormatTiming/getMatchUpFormatTiming';
import mocksEngine from '@Assemblies/engines/mock';
import { describe, expect, it } from 'vitest';

import { DOUBLES_EVENT } from '@Constants/eventConstants';

// categoryTypes
const JUNIOR = 'JUNIOR';
const ADULT = 'ADULT';

// POLICY_SCHEDULING_DEFAULT gives this format ADULT/WHEELCHAIR doubles 30 minutes
// of recovery and JUNIOR doubles 60. The gap is what makes the category
// observable at all — a format where both agree could not detect the clobber.
const MATCHUP_FORMAT = 'SET3-S:6/TB7';
const ADULT_DOUBLES_RECOVERY = 30;
const JUNIOR_DOUBLES_RECOVERY = 60;

function tournamentWith(category?: { categoryType?: string; subType?: string }) {
  const eventProfiles = [
    {
      eventName: 'Doubles',
      eventType: DOUBLES_EVENT,
      ...(category && { category }),
      drawProfiles: [{ drawSize: 4, matchUpFormat: MATCHUP_FORMAT }],
    },
  ];
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({ eventProfiles });
  return { tournamentRecord, event: tournamentRecord.events?.[0] };
}

/**
 * Regression guard for a silent category loss.
 *
 * `getScheduleTiming` resolves `categoryType` from `event.category`, but
 * `getMatchUpFormatTiming` then rebuilt `timingDetails` listing the
 * `categoryType` *parameter* after spreading `scheduleTiming` — so a caller that
 * passed an `event` rather than an explicit value had the resolved category
 * overwritten with `undefined`, and every JUNIOR event silently took ADULT
 * recovery times.
 */
describe('getMatchUpFormatTiming — categoryType resolved from the event', () => {
  it('resolves JUNIOR doubles recovery when only the event is passed', () => {
    const { tournamentRecord, event } = tournamentWith({ categoryType: JUNIOR });
    const timing: any = getMatchUpFormatTiming({
      eventType: DOUBLES_EVENT,
      matchUpFormat: MATCHUP_FORMAT,
      tournamentRecord,
      event,
    });
    expect(timing.recoveryMinutes).toEqual(JUNIOR_DOUBLES_RECOVERY);
  });

  it('resolves ADULT doubles recovery from the event, so the JUNIOR case is not a constant', () => {
    const { tournamentRecord, event } = tournamentWith({ categoryType: ADULT });
    const timing: any = getMatchUpFormatTiming({
      eventType: DOUBLES_EVENT,
      matchUpFormat: MATCHUP_FORMAT,
      tournamentRecord,
      event,
    });
    expect(timing.recoveryMinutes).toEqual(ADULT_DOUBLES_RECOVERY);
  });

  it('lets an explicitly-passed categoryType override the event', () => {
    const { tournamentRecord, event } = tournamentWith({ categoryType: ADULT });
    const timing: any = getMatchUpFormatTiming({
      eventType: DOUBLES_EVENT,
      matchUpFormat: MATCHUP_FORMAT,
      categoryType: JUNIOR,
      tournamentRecord,
      event,
    });
    expect(timing.recoveryMinutes).toEqual(JUNIOR_DOUBLES_RECOVERY);
  });

  it('still resolves an explicit categoryType with no event at all', () => {
    const { tournamentRecord } = tournamentWith(undefined);
    const timing: any = getMatchUpFormatTiming({
      eventType: DOUBLES_EVENT,
      matchUpFormat: MATCHUP_FORMAT,
      categoryType: JUNIOR,
      tournamentRecord,
    });
    expect(timing.recoveryMinutes).toEqual(JUNIOR_DOUBLES_RECOVERY);
  });

  it('reads the category from `subType` when `categoryType` is absent', () => {
    // `getScheduleTiming` resolves `categoryType ?? subType`; the fallback added
    // alongside the clobber fix has to honour the same pair or the two disagree
    // about what an event's category is.
    const { tournamentRecord, event } = tournamentWith({ subType: JUNIOR });
    const timing: any = getMatchUpFormatTiming({
      eventType: DOUBLES_EVENT,
      matchUpFormat: MATCHUP_FORMAT,
      tournamentRecord,
      event,
    });
    expect(timing.recoveryMinutes).toEqual(JUNIOR_DOUBLES_RECOVERY);
  });

  it('falls back to the uncategorised figure when the event carries no category', () => {
    const { tournamentRecord, event } = tournamentWith(undefined);
    const timing: any = getMatchUpFormatTiming({
      eventType: DOUBLES_EVENT,
      matchUpFormat: MATCHUP_FORMAT,
      tournamentRecord,
      event,
    });
    expect(timing.recoveryMinutes).toEqual(ADULT_DOUBLES_RECOVERY);
  });
});

describe('getEventMatchUpFormatTiming — categoryType defaults to the event category', () => {
  it('reports JUNIOR recovery without being told the categoryType', () => {
    const { tournamentRecord, event } = tournamentWith({ categoryType: JUNIOR });
    const result: any = getEventMatchUpFormatTiming({
      matchUpFormats: [MATCHUP_FORMAT],
      tournamentRecord,
      event,
    });
    const timing = result.eventMatchUpFormatTiming?.find((t) => t.matchUpFormat === MATCHUP_FORMAT);
    expect(timing.recoveryMinutes).toEqual(JUNIOR_DOUBLES_RECOVERY);
  });

  it('reports ADULT recovery for an adult event, so the JUNIOR case is not a constant', () => {
    const { tournamentRecord, event } = tournamentWith({ categoryType: ADULT });
    const result: any = getEventMatchUpFormatTiming({
      matchUpFormats: [MATCHUP_FORMAT],
      tournamentRecord,
      event,
    });
    const timing = result.eventMatchUpFormatTiming?.find((t) => t.matchUpFormat === MATCHUP_FORMAT);
    expect(timing.recoveryMinutes).toEqual(ADULT_DOUBLES_RECOVERY);
  });

  it('reads the category from `subType` when `categoryType` is absent', () => {
    const { tournamentRecord, event } = tournamentWith({ subType: JUNIOR });
    const result: any = getEventMatchUpFormatTiming({
      matchUpFormats: [MATCHUP_FORMAT],
      tournamentRecord,
      event,
    });
    const timing = result.eventMatchUpFormatTiming?.find((t) => t.matchUpFormat === MATCHUP_FORMAT);
    expect(timing.recoveryMinutes).toEqual(JUNIOR_DOUBLES_RECOVERY);
  });

  it('lets an explicit categoryType override the event category', () => {
    const { tournamentRecord, event } = tournamentWith({ categoryType: ADULT });
    const result: any = getEventMatchUpFormatTiming({
      matchUpFormats: [MATCHUP_FORMAT],
      categoryType: JUNIOR,
      tournamentRecord,
      event,
    });
    const timing = result.eventMatchUpFormatTiming?.find((t) => t.matchUpFormat === MATCHUP_FORMAT);
    expect(timing.recoveryMinutes).toEqual(JUNIOR_DOUBLES_RECOVERY);
  });
});
