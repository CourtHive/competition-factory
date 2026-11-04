import { isMatchUpEventType } from '@Helpers/matchUpEventTypes/isMatchUpEventType';
import { getMatchUpFormatRecoveryTimes } from './getMatchUpFormatRecoveryTimes';
import { finalSetGoverns } from '@Helpers/matchUpFormatCode/aggregateDecider';
import { parse as parseMatchUpFormat } from '@Helpers/matchUpFormatCode/parse';
import { getMatchUpFormatAverageTimes } from './getMatchUpFormatAverageTimes';
import { getOvernightRecoveryTimes } from './getOvernightRecoveryTimes';
import { getBandedRecoveryMinutes } from './getBandedRecoveryMinutes';
import { getScheduleTiming } from './getScheduleTiming';

// constants, types and fixtures
import { POLICY_SCHEDULING_DEFAULT } from '@Fixtures/policies/POLICY_SCHEDULING_DEFAULT';
import { DOUBLES_SINGLES, SINGLES_DOUBLES } from '@Constants/scheduleConstants';
import { MISSING_TOURNAMENT_RECORD } from '@Constants/errorConditionConstants';
import { Event, Tournament, EventTypeUnion } from '@Types/tournamentTypes';
import { POLICY_TYPE_SCHEDULING } from '@Constants/policyConstants';
import { PolicyDefinitions, ResultType } from '@Types/factoryTypes';
import { SINGLES_EVENT, TEAM_EVENT } from '@Constants/eventConstants';

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
  // a line (SINGLES/DOUBLES) of a TEAM event also reads the minutes the event's own timing is keyed by (TEAM)
  const teamLine = event?.eventType === TEAM_EVENT && eventType !== TEAM_EVENT;

  const { scheduleTiming } = getScheduleTiming({
    policyDefinitions,
    tournamentRecord,
    categoryName,
    categoryType,
    event,
  });

  const timingDetails = resolveTimingDetails({
    defaultRecoveryMinutes,
    defaultAverageMinutes,
    scheduleTiming,
    matchUpFormat,
    categoryType,
  });

  return matchUpFormatTimes({ eventType, timingDetails, playedMinutes, teamLine });
}

type ResolveTimingDetailsArgs = {
  defaultRecoveryMinutes?: number;
  defaultAverageMinutes?: number;
  categoryType?: string;
  matchUpFormat?: string;
  /** absent when the record states no timing: the default policy then decides */
  scheduleTiming?: ReturnType<typeof getScheduleTiming>['scheduleTiming'];
};

/**
 * The timing details `matchUpFormatTimes` resolves from: the schedule timing a record states, with the fallbacks every
 * reader of it must share. Two readers resolving the same matchUp differently is C3 (SCHEDULING_PIPELINE_VNEXT.md § 5):
 * hydration's `timeAfterRecovery` read the bare schedule timing, so with no policy attached it found no minutes at all,
 * while the scheduler, through `getMatchUpFormatTiming`, read the default policy's 90 and 60.
 */
export function resolveTimingDetails({
  defaultAverageMinutes = 90,
  defaultRecoveryMinutes = 0,
  scheduleTiming,
  matchUpFormat,
  categoryType,
}: ResolveTimingDetailsArgs) {
  // Timed-format default: when matchUpFormat carries explicit durations,
  // derive the default average from the code itself instead of falling back
  // to a flat 90. Whole-match cap (-M:T<n>) wins outright; otherwise the
  // worst-case total is count * setMinutes (count = exactly, else bestOf),
  // with the final-set minutes substituted for the last set when -F:T<n>
  // governs it. So:
  //   SET1-S:T20         → 20
  //   SET3-S:T15         → 45 (3 × 15)
  //   SET3-S:T15-F:T10   → 40 (2 × 15 + 10)
  //   SET2XA-S:T45P      → 90 (2 × 45)
  //   SET3XA-S:T10-F:TB1 → 30 (the decider is set 4, beyond the 3)
  //   <anything>-M:T60   → 60
  // Explicit policy / event / tournament timings still take precedence.
  const timedDefaultMinutes = timedDefaultMinutesOf(matchUpFormat);
  const effectiveDefaultAverage = timedDefaultMinutes ?? defaultAverageMinutes;

  const defaultTiming = {
    averageTimes: [{ minutes: { default: effectiveDefaultAverage } }],
    recoveryTimes: [{ minutes: { default: defaultRecoveryMinutes } }],
  };

  // Default-policy fallback: when no scheduling policy is attached we
  // substitute POLICY_SCHEDULING_DEFAULT so per-format averages and
  // recovery times take effect instead of a flat 90/0. Explicit
  // tournament/event extensions still win via the existing precedence.
  let policyWithFallback = scheduleTiming?.policy ?? POLICY_SCHEDULING_DEFAULT[POLICY_TYPE_SCHEDULING];

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
    categoryType: categoryType ?? scheduleTiming?.categoryType,
    defaultTiming,
  };

  return timingDetails;
}

/**
 * A format's own minutes, memoized by code: a pure function of the string, read for every timed matchUp a hydration
 * with `afterRecoveryTimes` returns (C3), which parsed the same few codes once per matchUp. The cache is bounded.
 */
const TIMED_DEFAULT_CACHE_LIMIT = 512;
const timedDefaultCache = new Map<string, number | undefined>();
function timedDefaultMinutesOf(matchUpFormat?: string): number | undefined {
  if (!matchUpFormat) return undefined;
  if (timedDefaultCache.has(matchUpFormat)) return timedDefaultCache.get(matchUpFormat);
  if (timedDefaultCache.size >= TIMED_DEFAULT_CACHE_LIMIT) timedDefaultCache.clear();
  const minutes = deriveTimedDefaultMinutes(parseMatchUpFormat(matchUpFormat));
  timedDefaultCache.set(matchUpFormat, minutes);
  return minutes;
}

function deriveTimedDefaultMinutes(parsed: ReturnType<typeof parseMatchUpFormat>): number | undefined {
  if (!parsed) return undefined;

  // Whole-match time cap (-M:T<n>) wins outright.
  const matchCapMinutes = parsed.matchUpConstraint?.timed ? parsed.matchUpConstraint.minutes : undefined;
  if (typeof matchCapMinutes === 'number') return matchCapMinutes;

  const setMinutes =
    parsed.setFormat?.timed && typeof parsed.setFormat.minutes === 'number' ? parsed.setFormat.minutes : undefined;
  if (typeof setMinutes !== 'number') return undefined;

  // An exactly-N format plays all N segments and leaves `bestOf` undefined: reading only `bestOf` priced
  // SET2XA-S:T45P as one 45-minute half
  const count = parsed.exactly ?? parsed.bestOf ?? 1;
  // -F: substitutes for the last of the count only when it governs that set; an aggregate format's decider
  // is set N + 1, played on a level total, and is not part of the regulation priced here
  const finalSetMinutes =
    parsed.finalSetFormat?.timed &&
    typeof parsed.finalSetFormat.minutes === 'number' &&
    finalSetGoverns(parsed, count, true)
      ? parsed.finalSetFormat.minutes
      : undefined;

  if (count <= 1) return setMinutes;
  if (typeof finalSetMinutes === 'number') return (count - 1) * setMinutes + finalSetMinutes;
  return count * setMinutes;
}

type MatchUpFormatTimesArgs = {
  eventType: EventTypeUnion;
  playedMinutes?: number;
  /** the matchUp is a collection line (SINGLES/DOUBLES) of a TEAM event */
  teamLine?: boolean;
  timingDetails: any;
};

/**
 * The minutes a timing entry states for `eventType`, else for TEAM when the matchUp is a line of a TEAM event, else its
 * `default`. `modifyEventMatchUpFormatTiming` keys a TEAM event's override by the event's type, TEAM, while the
 * collection matchUps it times are SINGLES or DOUBLES: a reader asking for the line's type found no minutes and fell
 * back to defaults, so the override was shown and saved but never used. A key for the line's own type still wins.
 */
function minutesFor(minutes: Record<string, any> | undefined, eventType: string, teamLine?: boolean) {
  if (!minutes) return minutes;
  return minutes[eventType] || (teamLine && minutes[TEAM_EVENT]) || minutes.default;
}

export function matchUpFormatTimes({
  timingDetails,
  playedMinutes,
  eventType,
  teamLine,
}: MatchUpFormatTimesArgs): ResultType & {
  typeChangeRecoveryMinutes?: number;
  recoveryMinutes?: number;
  overnightMinutes?: number;
  averageMinutes?: number;
  /** True when `recoveryMinutes` came from a `byPlayedMinutes` band rather than the flat table. */
  recoveryFromPlayedMinutes?: boolean;
} {
  const averageTimes = getMatchUpFormatAverageTimes(timingDetails);
  const averageMinutes = minutesFor(averageTimes?.minutes, eventType, teamLine);

  const recoveryTimes = getMatchUpFormatRecoveryTimes({
    ...timingDetails,
    averageMinutes,
  });

  const recoveryKeys = Object.keys(recoveryTimes?.minutes ?? {});
  const flatRecoveryMinutes = minutesFor(recoveryTimes?.minutes, eventType, teamLine);

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
  const overnightMinutes = minutesFor(overnightTimes?.minutes, eventType, teamLine);

  return {
    recoveryFromPlayedMinutes: bandedMinutes !== undefined,
    typeChangeRecoveryMinutes,
    overnightMinutes,
    recoveryMinutes,
    averageMinutes,
  };
}
