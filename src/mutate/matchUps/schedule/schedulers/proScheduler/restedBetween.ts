import { makeTimingResolver, SchedulingTiming } from '@Query/matchUps/scheduling/schedulingTiming';
import { getTournamentTimeZone } from '@Query/tournaments/getTournamentTimeZone';
import { isFinished } from '@Query/matchUps/scheduling/getMatchUpReadiness';
import { wasPlayed } from '@Query/reports/recoveryTimeline';
import {
  normalizeTimes,
  NormalizedTimes,
  requirementFor,
  resolveAnchors,
} from '@Query/matchUps/scheduling/getParticipantRest';

// types
import { Tournament } from '@Types/tournamentTypes';
import { HydratedMatchUp } from '@Types/hydrated';

const MS_PER_MINUTE = 60_000;

type RestedBetweenArgs = {
  matchUpOf: (matchUpId: string) => HydratedMatchUp | undefined;
  tournamentRecords: { [key: string]: Tournament };
};

/**
 * Whether the participants coming out of `earlierId` have had their recovery before `laterId` begins.
 *
 * Adjacent rows of a grid are an order of play, not a clock: a matchUp in the row after another can start hours
 * later. Back to back is worth a warning only when the time between them is short of recovery, so this reads the
 * times (CA 2026-10-18: "when the scheduled time leaves enough time for recovery (average matchUp time plus
 * recovery) then the warning should go away entirely").
 *
 * What actually happened wins over the plan, on both sides:
 * - the earlier matchUp is free at the strongest plausible rung of the rest ladder (`resolveAnchors`: endTime,
 *   scoredTime, then startTime / calledAt / scheduledTime plus averageMinutes);
 * - the later matchUp begins at its startTime, else its calledAt, else its scheduledTime;
 * - recovery is the earlier matchUp's, or the type-change figure across singles and doubles (`requirementFor`).
 *
 * `calledAt` and `scoredTime` are UTC instants while the other times are venue wall clock, so the instants are read
 * only when the tournament's zone is known; without one they would be wrong by the venue's offset. A matchUp that
 * finished without being played (a walkover) asks no recovery. Anything that cannot be placed in time is not rested:
 * the warning stays when the times cannot clear it.
 */
export function makeRestedBetween({ tournamentRecords, matchUpOf }: RestedBetweenArgs) {
  const timingResolvers: { [key: string]: (matchUp: HydratedMatchUp) => SchedulingTiming } = {};
  const zones: { [key: string]: string | undefined } = {};
  const times: { [key: string]: NormalizedTimes } = {};

  const tournamentOf = (matchUp: HydratedMatchUp) =>
    tournamentRecords[matchUp.tournamentId] ?? Object.values(tournamentRecords)[0];

  const timingFor = (matchUp: HydratedMatchUp) => {
    const tournamentId = matchUp.tournamentId ?? '';
    timingResolvers[tournamentId] ??= makeTimingResolver(tournamentOf(matchUp));
    return timingResolvers[tournamentId](matchUp);
  };

  const timesOf = (matchUp: HydratedMatchUp) => {
    if (times[matchUp.matchUpId]) return times[matchUp.matchUpId];
    const tournamentId = matchUp.tournamentId ?? '';
    if (!(tournamentId in zones))
      zones[tournamentId] = getTournamentTimeZone({ tournamentRecord: tournamentOf(matchUp) }).timeZone;
    const timeZone = zones[tournamentId];
    const normalized = normalizeTimes(matchUp, { utcOffsetMinutes: 0, timeZone });
    times[matchUp.matchUpId] = timeZone
      ? normalized
      : { ...normalized, calledMs: null, scoredMs: null, scoredDate: null };
    return times[matchUp.matchUpId];
  };

  return (earlierId: string, laterId: string): boolean => {
    const earlier = matchUpOf(earlierId);
    const later = matchUpOf(laterId);
    if (!earlier || !later) return false;
    if (isFinished(earlier) && !wasPlayed(earlier)) return true;

    const timing = timingFor(earlier);
    const free = resolveAnchors(timesOf(earlier), timing).find((anchor) => !anchor.implausible);
    const { startMs, calledMs, scheduledMs } = timesOf(later);
    const begins = startMs ?? calledMs ?? scheduledMs;
    if (!free || begins === null) return false;

    const { requiredMinutes } = requirementFor(earlier, later, timing);
    return begins >= free.ms + requiredMinutes * MS_PER_MINUTE;
  };
}
