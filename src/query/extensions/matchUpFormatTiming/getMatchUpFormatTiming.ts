import { isMatchUpEventType } from '@Helpers/matchUpEventTypes/isMatchUpEventType';
import { getMatchUpFormatRecoveryTimes } from './getMatchUpFormatRecoveryTimes';
import { getOvernightRecoveryTimes } from './getOvernightRecoveryTimes';
import { getBandedRecoveryMinutes } from './getBandedRecoveryMinutes';
import { parse as parseMatchUpFormat } from '@Helpers/matchUpFormatCode/parse';
import { getMatchUpFormatAverageTimes } from './getMatchUpFormatAverageTimes';
import { getScheduleTiming } from './getScheduleTiming';

// constants, types and fixtures
import { POLICY_SCHEDULING_DEFAULT } from '@Fixtures/policies/POLICY_SCHEDULING_DEFAULT';
import { DOUBLES_SINGLES, SINGLES_DOUBLES } from '@Constants/scheduleConstants';
import { MISSING_TOURNAMENT_RECORD } from '@Constants/errorConditionConstants';
import { Event, Tournament, EventTypeUnion } from '@Types/tournamentTypes';
import { POLICY_TYPE_SCHEDULING } from '@Constants/policyConstants';
import { SINGLES_EVENT } from '@Constants/eventConstants';
import { PolicyDefinitions, ResultType } from '@Types/factoryTypes';

type GetMatchUpFormatTimingArgs = {
  policyDefinitions?: PolicyDefinitions;
  playedMinutes?: number;
  defaultRecoveryMinutes?: number;
  defaultAverageMinutes?: number;
  tournamentRecord: Tournament;
  matchUpFormat: string;
  categoryName?: string;
  categoryType?: string;
  eventType?: EventTypeUnion;
  event?: Event;
};

export function getMatchUpFormatTiming({
  defaultAverageMinutes = 90,
  defaultRecoveryMinutes = 0,
  policyDefinitions,
  tournamentRecord,
  playedMinutes,
  matchUpFormat,
  categoryName,
  categoryType,
  eventType,
  event,
}: GetMatchUpFormatTimingArgs) {
  if (!tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };

  // event is optional, so eventType can also be passed in directly
  eventType = eventType ?? event?.eventType ?? SINGLES_EVENT;

  // Timed-format default: when matchUpFormat carries explicit durations,
  // derive the default average from the code itself instead of falling back
  // to a flat 90. Whole-match cap (-M:T<n>) wins outright; otherwise the
  // worst-case total is bestOf * setMinutes, with the final-set minutes
  // substituted for the last set when -F:T<n> is provided. So:
  //   SET1-S:T20         → 20
  //   SET3-S:T15         → 45 (3 × 15)
  //   SET3-S:T15-F:T10   → 40 (2 × 15 + 10)
  //   <anything>-M:T60   → 60
  // Explicit policy / event / tournament timings still take precedence.
  const parsed = parseMatchUpFormat(matchUpFormat);
  const timedDefaultMinutes = deriveTimedDefaultMinutes(parsed);
  const effectiveDefaultAverage = timedDefaultMinutes ?? defaultAverageMinutes;

  const defaultTiming = {
    averageTimes: [{ minutes: { default: effectiveDefaultAverage } }],
    recoveryTimes: [{ minutes: { default: defaultRecoveryMinutes } }],
  };

  const { scheduleTiming } = getScheduleTiming({
    policyDefinitions,
    tournamentRecord,
    categoryName,
    categoryType,
    event,
  });

  // Default-policy fallback: when no scheduling policy is attached we
  // substitute POLICY_SCHEDULING_DEFAULT so per-format averages and
  // recovery times take effect instead of a flat 90/0. Explicit
  // tournament/event extensions still win via the existing precedence.
  let policyWithFallback = scheduleTiming.policy ?? POLICY_SCHEDULING_DEFAULT[POLICY_TYPE_SCHEDULING];

  // For a timed format not specifically enumerated by the policy, the
  // policy-wide `defaultTimes.averageTimes` (typically a flat 90) would
  // otherwise win over our computed default and prevent the parsed
  // duration from taking effect. Override it. Per-format entries in
  // `matchUpAverageTimes` still take precedence — e.g. POLICY_SCHEDULING_DEFAULT
  // pins SET1-S:T20 to 20 explicitly.
  if (typeof timedDefaultMinutes === 'number' && policyWithFallback) {
    policyWithFallback = {
      ...policyWithFallback,
      defaultTimes: {
        ...policyWithFallback.defaultTimes,
        averageTimes: [{ minutes: { default: timedDefaultMinutes } }],
      },
    };
  }

  const timingDetails = {
    ...scheduleTiming,
    policy: policyWithFallback,
    matchUpFormat,
    // `scheduleTiming.categoryType` is already resolved — `getScheduleTiming`
    // derives it from `event.category.categoryType ?? subType` when the caller
    // supplied an event rather than an explicit value. Listing the *parameter*
    // here unconditionally overwrote that with `undefined`, so passing an event
    // resolved recovery as if the event had no category at all: a JUNIOR
    // doubles event took the ADULT figure (30) instead of its own (60).
    // An explicitly-passed categoryType still wins, which is why this is `??`
    // rather than a plain removal of the key.
    categoryType: categoryType ?? scheduleTiming.categoryType,
    defaultTiming,
  };

  return matchUpFormatTimes({ eventType, timingDetails, playedMinutes });
}

function deriveTimedDefaultMinutes(parsed: ReturnType<typeof parseMatchUpFormat>): number | undefined {
  if (!parsed) return undefined;

  // Whole-match time cap (-M:T<n>) wins outright.
  const matchCapMinutes = parsed.matchUpConstraint?.timed ? parsed.matchUpConstraint.minutes : undefined;
  if (typeof matchCapMinutes === 'number') return matchCapMinutes;

  const setMinutes =
    parsed.setFormat?.timed && typeof parsed.setFormat.minutes === 'number' ? parsed.setFormat.minutes : undefined;
  if (typeof setMinutes !== 'number') return undefined;

  const bestOf = parsed.bestOf ?? 1;
  const finalSetMinutes =
    parsed.finalSetFormat?.timed && typeof parsed.finalSetFormat.minutes === 'number'
      ? parsed.finalSetFormat.minutes
      : undefined;

  if (bestOf <= 1) return setMinutes;
  if (typeof finalSetMinutes === 'number') return (bestOf - 1) * setMinutes + finalSetMinutes;
  return bestOf * setMinutes;
}

type MatchUpFormatTimesArgs = {
  eventType: EventTypeUnion;
  playedMinutes?: number;
  timingDetails: any;
};
export function matchUpFormatTimes({ timingDetails, playedMinutes, eventType }: MatchUpFormatTimesArgs): ResultType & {
  typeChangeRecoveryMinutes?: number;
  recoveryMinutes?: number;
  overnightMinutes?: number;
  averageMinutes?: number;
  /** True when `recoveryMinutes` came from a `byPlayedMinutes` band rather than the flat table. */
  recoveryFromPlayedMinutes?: boolean;
} {
  const averageTimes = getMatchUpFormatAverageTimes(timingDetails);
  const averageKeys = Object.keys(averageTimes?.minutes ?? {});

  const averageMinutes =
    averageTimes?.minutes &&
    ((averageKeys?.includes(eventType) && averageTimes.minutes[eventType]) || averageTimes.minutes.default);

  const recoveryTimes = getMatchUpFormatRecoveryTimes({
    ...timingDetails,
    averageMinutes,
  });

  const recoveryKeys = Object.keys(recoveryTimes?.minutes ?? {});
  const flatRecoveryMinutes =
    recoveryTimes?.minutes &&
    ((recoveryKeys?.includes(eventType) && recoveryTimes.minutes[eventType]) || recoveryTimes.minutes.default);

  // A duration band wins over the flat figure, but only when the policy authors
  // one AND the caller measured a duration to key it on. Absent either, this is
  // undefined and resolution is exactly what it was.
  const bandedMinutes = getBandedRecoveryMinutes({
    byPlayedMinutes: recoveryTimes?.byPlayedMinutes,
    playedMinutes,
  });
  const recoveryMinutes = bandedMinutes ?? flatRecoveryMinutes;

  const formatChangeKey = isMatchUpEventType(SINGLES_EVENT)(eventType) ? SINGLES_DOUBLES : DOUBLES_SINGLES;

  const typeChangeRecoveryMinutes =
    recoveryTimes?.minutes &&
    ((recoveryKeys?.includes(formatChangeKey) && recoveryTimes.minutes[formatChangeKey]) || recoveryMinutes);

  // Overnight is a property of the day boundary rather than of the format, so it
  // is resolved independently of averageMinutes. Stays undefined when no policy
  // configures it — callers must read that as "no rule", not as zero.
  const overnightTimes = getOvernightRecoveryTimes(timingDetails);
  const overnightKeys = Object.keys(overnightTimes?.minutes ?? {});
  const overnightMinutes =
    overnightTimes?.minutes &&
    ((overnightKeys?.includes(eventType) && overnightTimes.minutes[eventType]) || overnightTimes.minutes.default);

  return {
    recoveryFromPlayedMinutes: bandedMinutes !== undefined,
    typeChangeRecoveryMinutes,
    overnightMinutes,
    recoveryMinutes,
    averageMinutes,
  };
}
