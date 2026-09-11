import { getMatchUpFormatTiming } from '@Query/extensions/matchUpFormatTiming/getMatchUpFormatTiming';
import { getScheduleTiming } from '@Query/extensions/matchUpFormatTiming/getScheduleTiming';
import mocksEngine from '@Assemblies/engines/mock';
import { describe, expect, it } from 'vitest';

import { POLICY_TYPE_SCHEDULING } from '@Constants/policyConstants';
import { DOUBLES_EVENT } from '@Constants/eventConstants';

const MATCHUP_FORMAT = 'SET3-S:6/TB7';

// POLICY_SCHEDULING_DEFAULT gives DOUBLES 30 minutes of recovery for this
// format. Both policies below are deliberately different from that default AND
// from each other, so neither result can be produced by accident.
const ATTACHED_RECOVERY = 45;
const OVERRIDE_RECOVERY = 75;

const schedulingPolicy = (recoveryMinutes: number) => ({
  [POLICY_TYPE_SCHEDULING]: {
    defaultTimes: {
      averageTimes: [{ categoryNames: [], minutes: { default: 90 } }],
      recoveryTimes: [{ minutes: { default: recoveryMinutes } }],
    },
  },
});

function tournamentWithAttachedPolicy() {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    policyDefinitions: schedulingPolicy(ATTACHED_RECOVERY),
    eventProfiles: [
      {
        drawProfiles: [{ drawSize: 4, matchUpFormat: MATCHUP_FORMAT }],
        eventType: DOUBLES_EVENT,
        eventName: 'Doubles',
      },
    ],
  });
  return { tournamentRecord, event: tournamentRecord.events?.[0] };
}

/**
 * `getScheduleTiming` read the attached scheduling policy and offered no way to
 * substitute one, unlike `allEventMatchUps` / `getParticipantEntries` and the
 * rest of the query surface. A report therefore could not answer "what would
 * this tournament look like under a *different* policy" without mutating it.
 */
describe('getScheduleTiming — policyDefinitions override', () => {
  it('resolves the attached policy when no override is supplied', () => {
    const { tournamentRecord, event } = tournamentWithAttachedPolicy();
    const timing: any = getMatchUpFormatTiming({
      matchUpFormat: MATCHUP_FORMAT,
      eventType: DOUBLES_EVENT,
      tournamentRecord,
      event,
    });
    expect(timing.recoveryMinutes).toEqual(ATTACHED_RECOVERY);
  });

  it('a supplied policy wins over the attached one', () => {
    const { tournamentRecord, event } = tournamentWithAttachedPolicy();
    const timing: any = getMatchUpFormatTiming({
      policyDefinitions: schedulingPolicy(OVERRIDE_RECOVERY),
      matchUpFormat: MATCHUP_FORMAT,
      eventType: DOUBLES_EVENT,
      tournamentRecord,
      event,
    });
    // Falsification: this differs from BOTH the attached policy and the
    // POLICY_SCHEDULING_DEFAULT figure, so it cannot be a passthrough or a
    // fallback masquerading as an override.
    expect(timing.recoveryMinutes).toEqual(OVERRIDE_RECOVERY);
    expect(timing.recoveryMinutes).not.toEqual(ATTACHED_RECOVERY);
  });

  it('surfaces the supplied policy on scheduleTiming itself', () => {
    const { tournamentRecord, event } = tournamentWithAttachedPolicy();
    const override = schedulingPolicy(OVERRIDE_RECOVERY);
    const { scheduleTiming }: any = getScheduleTiming({
      policyDefinitions: override,
      tournamentRecord,
      event,
    });
    expect(scheduleTiming.policy).toEqual(override[POLICY_TYPE_SCHEDULING]);
  });

  it('leaves resolution untouched for a tournament with no attached policy', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      eventProfiles: [
        {
          drawProfiles: [{ drawSize: 4, matchUpFormat: MATCHUP_FORMAT }],
          eventType: DOUBLES_EVENT,
          eventName: 'Doubles',
        },
      ],
    });
    const event = tournamentRecord.events?.[0];
    const timing: any = getMatchUpFormatTiming({
      matchUpFormat: MATCHUP_FORMAT,
      eventType: DOUBLES_EVENT,
      tournamentRecord,
      event,
    });
    // POLICY_SCHEDULING_DEFAULT's DOUBLES figure — the existing fallback, proving
    // the added parameter changes nothing when it is absent.
    expect(timing.recoveryMinutes).toEqual(30);
  });
});
