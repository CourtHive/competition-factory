import { getReachableParticipantIds, ParticipantReachability } from './getParticipantReachability';
import { checkParticipantProfileInitialization } from './checkParticipantProfileInitialization';
import type { IndividualParticipantProfiles } from './checkParticipantProfileInitialization';
import { getParticipantDayLoads } from './participantDayLoad';

// constants
import { TOTAL } from '@Constants/scheduleConstants';

export type DailyLimits = { [counterName: string]: number };
export type DailyLimitOverrides = {
  participants?: { [participantId: string]: DailyLimits }; // a policy's per-participant matchUpDailyLimits
  tournaments?: { [tournamentId: string]: DailyLimits }; // each tournament's own defaults
};

/**
 * The limits that apply to one participant in one matchUp: the defaults of the matchUp's own tournament (or
 * `matchUpDailyLimits` when the tournament has none listed), with the participant's override, key by key, on top.
 */
export function resolveDailyLimits({
  dailyLimitOverrides,
  matchUpDailyLimits,
  participantId,
  tournamentId,
}: {
  dailyLimitOverrides?: DailyLimitOverrides;
  matchUpDailyLimits?: DailyLimits;
  participantId: string;
  tournamentId?: string;
}): DailyLimits {
  const tournamentLimits = tournamentId ? dailyLimitOverrides?.tournaments?.[tournamentId] : undefined;
  const defaults = tournamentLimits ?? matchUpDailyLimits ?? {};
  return { ...defaults, ...dailyLimitOverrides?.participants?.[participantId] };
}

type CheckDailyLimitsArgs = {
  matchUpDailyLimits?: { [key: string]: number };
  dailyLimitOverrides?: DailyLimitOverrides;
  individualParticipantProfiles: IndividualParticipantProfiles;
  reachability: ParticipantReachability;
  matchUp: { matchUpId: string; drawId: string; matchUpType?: string; tournamentId?: string };
};

/**
 * A matchUp is over a participant's daily limit when adding it raises the most matchUps they can actually play on the
 * day (their day load, by matchUpType or in TOTAL) beyond the limit. Participants certain to play it and participants
 * who can only potentially reach it are both checked; see participantDayLoad for how potentials count.
 */
export function checkDailyLimits({
  individualParticipantProfiles,
  matchUpDailyLimits = {},
  dailyLimitOverrides,
  reachability,
  matchUp,
}: CheckDailyLimitsArgs) {
  const { matchUpId, drawId, matchUpType } = matchUp;
  const { certain, all: relevantParticipantIds } = getReachableParticipantIds(reachability, matchUpId);

  const certainIds = new Set(certain);
  const participantIdsAtLimit = relevantParticipantIds.filter((participantId) => {
    const limits = resolveDailyLimits({
      tournamentId: matchUp.tournamentId,
      dailyLimitOverrides,
      matchUpDailyLimits,
      participantId,
    });
    const counterNames = [matchUpType, TOTAL].filter((counterName) => counterName && limits[counterName as string]);
    // no limit applies: nothing to compute
    if (!counterNames.length) return false;

    // adding one matchUp raises a day load by at most one (a certain matchUp adds one; a potential one lengthens the
    // longest chain by at most one), so a participant whose load without it is below every limit cannot exceed one.
    // `counters` is that load, refreshed whenever the participant's day changes (modifyParticipantDayMatchUps). Most
    // asks end here; computing the load for every participant of every candidate at every slot was the profile
    // scheduler's main cost (SCHEDULING_PIPELINE_VNEXT.md § 7.0)
    checkParticipantProfileInitialization({ individualParticipantProfiles, participantId });
    const { counters } = individualParticipantProfiles[participantId];
    const mayExceed = counterNames.some(
      (counterName) => (counters[counterName as string] ?? 0) + 1 > limits[counterName as string],
    );
    if (!mayExceed) return false;

    const loads = getParticipantDayLoads({
      addingMatchUp: { matchUpId, drawId, matchUpType, certain: certainIds.has(participantId) },
      individualParticipantProfiles,
      reachability,
      participantId,
    });
    return counterNames.some((counterName) => (loads[counterName as string] ?? 0) > limits[counterName as string]);
  });

  return { participantIdsAtLimit, relevantParticipantIds };
}
