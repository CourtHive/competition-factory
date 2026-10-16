import { getReachableParticipantIds, ParticipantReachability } from './getParticipantReachability';
import type { IndividualParticipantProfiles } from './checkParticipantProfileInitialization';
import { getParticipantDayLoads } from './participantDayLoad';

// constants
import { TOTAL } from '@Constants/scheduleConstants';

type CheckDailyLimitsArgs = {
  matchUpDailyLimits?: { [key: string]: number };
  individualParticipantProfiles: IndividualParticipantProfiles;
  reachability: ParticipantReachability;
  matchUp: { matchUpId: string; drawId: string; matchUpType?: string };
};

/**
 * A matchUp is over a participant's daily limit when adding it raises the most matchUps they can actually play on the
 * day (their day load, by matchUpType or in TOTAL) beyond the limit. Participants certain to play it and participants
 * who can only potentially reach it are both checked; see participantDayLoad for how potentials count.
 */
export function checkDailyLimits({
  individualParticipantProfiles,
  matchUpDailyLimits = {},
  reachability,
  matchUp,
}: CheckDailyLimitsArgs) {
  const { matchUpId, drawId, matchUpType } = matchUp;
  const { certain, all: relevantParticipantIds } = getReachableParticipantIds(reachability, matchUpId);

  const participantIdsAtLimit = relevantParticipantIds.filter((participantId) => {
    const loads = getParticipantDayLoads({
      withMatchUp: { matchUpId, drawId, matchUpType, certain: certain.includes(participantId) },
      individualParticipantProfiles,
      reachability,
      participantId,
    });
    return [matchUpType, TOTAL].some((counterName) => {
      const dailyLimit = counterName && matchUpDailyLimits[counterName];
      return !!dailyLimit && (loads[counterName as string] ?? 0) > dailyLimit;
    });
  });

  return { participantIdsAtLimit, relevantParticipantIds };
}
