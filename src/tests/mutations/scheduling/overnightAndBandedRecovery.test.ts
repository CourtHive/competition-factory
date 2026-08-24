import { getMatchUpFormatTiming } from '@Query/extensions/matchUpFormatTiming/getMatchUpFormatTiming';
import { getBandedRecoveryMinutes } from '@Query/extensions/matchUpFormatTiming/getBandedRecoveryMinutes';
import mocksEngine from '@Assemblies/engines/mock';
import { describe, expect, it } from 'vitest';

import { POLICY_TYPE_SCHEDULING } from '@Constants/policyConstants';
import { DOUBLES_EVENT } from '@Constants/eventConstants';
import { SINGLES_EVENT } from '@Constants/eventConstants';

const MATCHUP_FORMAT = 'SET3-S:6/TB7';
const JUNIOR = 'JUNIOR';
const ADULT = 'ADULT';

function tournamentWith({ categoryType, policyDefinitions }: any = {}) {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    ...(policyDefinitions && { policyDefinitions }),
    eventProfiles: [
      {
        ...(categoryType && { category: { categoryType } }),
        drawProfiles: [{ drawSize: 4, matchUpFormat: MATCHUP_FORMAT }],
        eventType: SINGLES_EVENT,
        eventName: 'Singles',
      },
    ],
  });
  return { tournamentRecord, event: tournamentRecord.events?.[0] };
}

describe('overnight recovery', () => {
  it('resolves the 12-hour junior figure from POLICY_SCHEDULING_DEFAULT', () => {
    const { tournamentRecord, event } = tournamentWith({ categoryType: JUNIOR });
    const timing: any = getMatchUpFormatTiming({
      matchUpFormat: MATCHUP_FORMAT,
      eventType: SINGLES_EVENT,
      tournamentRecord,
      event,
    });
    expect(timing.overnightMinutes).toEqual(720);
  });

  it('resolves no overnight constraint for adult play, so junior is not a constant', () => {
    const { tournamentRecord, event } = tournamentWith({ categoryType: ADULT });
    const timing: any = getMatchUpFormatTiming({
      matchUpFormat: MATCHUP_FORMAT,
      eventType: SINGLES_EVENT,
      tournamentRecord,
      event,
    });
    expect(timing.overnightMinutes).toEqual(0);
  });

  it('honours an overnight figure supplied via policyDefinitions', () => {
    const policyDefinitions = {
      [POLICY_TYPE_SCHEDULING]: {
        defaultTimes: {
          averageTimes: [{ categoryNames: [], minutes: { default: 90 } }],
          recoveryTimes: [{ minutes: { default: 60 } }],
          overnightTimes: [{ minutes: { default: 600 } }],
        },
      },
    };
    const { tournamentRecord, event } = tournamentWith({ categoryType: JUNIOR });
    const timing: any = getMatchUpFormatTiming({
      matchUpFormat: MATCHUP_FORMAT,
      eventType: SINGLES_EVENT,
      tournamentRecord,
      policyDefinitions,
      event,
    });
    // 600, not the default policy's 720 — the supplied policy wins even for a
    // JUNIOR event, which the default policy would otherwise answer.
    expect(timing.overnightMinutes).toEqual(600);
  });
});

describe('getBandedRecoveryMinutes', () => {
  // The long-standing USTA table: rest scales with how long the match ran.
  const usta = [{ upTo: 60, minutes: 30 }, { upTo: 90, minutes: 60 }, { minutes: 90 }];

  it('selects the band the played duration falls in', () => {
    expect(getBandedRecoveryMinutes({ byPlayedMinutes: usta, playedMinutes: 45 })).toEqual(30);
    expect(getBandedRecoveryMinutes({ byPlayedMinutes: usta, playedMinutes: 75 })).toEqual(60);
    expect(getBandedRecoveryMinutes({ byPlayedMinutes: usta, playedMinutes: 150 })).toEqual(90);
  });

  it('treats upTo as inclusive', () => {
    expect(getBandedRecoveryMinutes({ byPlayedMinutes: usta, playedMinutes: 60 })).toEqual(30);
    expect(getBandedRecoveryMinutes({ byPlayedMinutes: usta, playedMinutes: 61 })).toEqual(60);
  });

  it('is order-independent — the table may be authored in any order', () => {
    const shuffled = [{ minutes: 90 }, { upTo: 90, minutes: 60 }, { upTo: 60, minutes: 30 }];
    expect(getBandedRecoveryMinutes({ byPlayedMinutes: shuffled, playedMinutes: 45 })).toEqual(30);
    // The input array must not be reordered in place — policy fixtures are shared.
    expect(shuffled[0]).toEqual({ minutes: 90 });
  });

  it('returns undefined without a measured duration — the opt-in that keeps scheduling unchanged', () => {
    expect(getBandedRecoveryMinutes({ byPlayedMinutes: usta })).toBeUndefined();
    expect(getBandedRecoveryMinutes({ byPlayedMinutes: usta, playedMinutes: undefined })).toBeUndefined();
    expect(getBandedRecoveryMinutes({ byPlayedMinutes: usta, playedMinutes: -1 })).toBeUndefined();
    expect(getBandedRecoveryMinutes({ byPlayedMinutes: usta, playedMinutes: NaN })).toBeUndefined();
  });

  it('returns undefined without a banded table', () => {
    expect(getBandedRecoveryMinutes({ playedMinutes: 45 })).toBeUndefined();
    expect(getBandedRecoveryMinutes({ byPlayedMinutes: [], playedMinutes: 45 })).toBeUndefined();
  });

  it('returns undefined when no band covers the duration', () => {
    expect(
      getBandedRecoveryMinutes({ byPlayedMinutes: [{ upTo: 30, minutes: 15 }], playedMinutes: 200 }),
    ).toBeUndefined();
  });
});

describe('banded recovery through getMatchUpFormatTiming', () => {
  const bandedPolicy = {
    [POLICY_TYPE_SCHEDULING]: {
      defaultTimes: {
        averageTimes: [{ categoryNames: [], minutes: { default: 90 } }],
        recoveryTimes: [
          {
            minutes: { default: 60 },
            byPlayedMinutes: [{ upTo: 60, minutes: 30 }, { minutes: 120 }],
          },
        ],
      },
    },
  };

  it('uses the flat figure when no playedMinutes is supplied — every scheduler call site', () => {
    const { tournamentRecord, event } = tournamentWith({});
    const timing: any = getMatchUpFormatTiming({
      policyDefinitions: bandedPolicy,
      matchUpFormat: MATCHUP_FORMAT,
      eventType: SINGLES_EVENT,
      tournamentRecord,
      event,
    });
    expect(timing.recoveryMinutes).toEqual(60);
    expect(timing.recoveryFromPlayedMinutes).toBe(false);
  });

  it('uses the band when a measured duration is supplied', () => {
    const { tournamentRecord, event } = tournamentWith({});
    const short: any = getMatchUpFormatTiming({
      policyDefinitions: bandedPolicy,
      matchUpFormat: MATCHUP_FORMAT,
      eventType: SINGLES_EVENT,
      tournamentRecord,
      playedMinutes: 40,
      event,
    });
    const long: any = getMatchUpFormatTiming({
      policyDefinitions: bandedPolicy,
      matchUpFormat: MATCHUP_FORMAT,
      eventType: SINGLES_EVENT,
      tournamentRecord,
      playedMinutes: 180,
      event,
    });
    // Both differ from the flat 60 and from each other, so neither can be a
    // passthrough of the untouched figure.
    expect(short.recoveryMinutes).toEqual(30);
    expect(long.recoveryMinutes).toEqual(120);
    expect(short.recoveryFromPlayedMinutes).toBe(true);
  });

  it('ignores playedMinutes when the policy authors no bands', () => {
    const { tournamentRecord, event } = tournamentWith({});
    const timing: any = getMatchUpFormatTiming({
      matchUpFormat: MATCHUP_FORMAT,
      eventType: DOUBLES_EVENT,
      tournamentRecord,
      playedMinutes: 40,
      event,
    });
    // POLICY_SCHEDULING_DEFAULT's DOUBLES figure, unbanded.
    expect(timing.recoveryMinutes).toEqual(30);
    expect(timing.recoveryFromPlayedMinutes).toBe(false);
  });
});
