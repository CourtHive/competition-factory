import { firstClassGroupLeafOrExtension } from '@Mutate/extensions/setGroupLeafOrExtension';
import { checkRequiredParameters } from '@Helpers/parameters/checkRequiredParameters';

// constants and types
import type { DailyLimitOverrides, DailyLimits } from '@Mutate/matchUps/schedule/scheduleMatchUps/checkDailyLimits';
import { MISSING_TOURNAMENT_RECORDS } from '@Constants/errorConditionConstants';
import { POLICY_TYPE_SCHEDULING } from '@Constants/policyConstants';
import { TOURNAMENT_RECORD } from '@Constants/attributeConstants';
import { SCHEDULE_LIMITS } from '@Constants/extensionConstants';
import { Tournament } from '@Types/tournamentTypes';
import { findPolicy } from '@Acquire/findPolicy';
import { ResultType } from '@Types/factoryTypes';

type GetMatchUpDailyLimitsArgs = {
  tournamentRecords: { [key: string]: Tournament };
  tournamentId?: string;
};
export function getMatchUpDailyLimits({ tournamentRecords, tournamentId }: GetMatchUpDailyLimitsArgs): ResultType & {
  dailyLimitOverrides?: DailyLimitOverrides;
  matchUpDailyLimits?: any;
} {
  if (typeof tournamentRecords !== 'object' || !Object.keys(tournamentRecords).length)
    return { error: MISSING_TOURNAMENT_RECORDS };

  const tournamentIds = Object.keys(tournamentRecords).filter(
    (currentTournamentId) => !tournamentId || currentTournamentId === tournamentId,
  );

  // `matchUpDailyLimits` is the last tournament's, as it always was; each tournament's own defaults and every
  // participant override (the policy's `matchUpDailyLimits` array) are returned beside it
  let dailyLimits;
  const tournaments: NonNullable<DailyLimitOverrides['tournaments']> = {};
  const participants: NonNullable<DailyLimitOverrides['participants']> = {};
  tournamentIds.forEach((tournamentId) => {
    const tournamentRecord = tournamentRecords[tournamentId];

    const { matchUpDailyLimits, participantDailyLimits } = getDailyLimit({
      tournamentRecord,
    });
    dailyLimits = matchUpDailyLimits;
    if (matchUpDailyLimits) tournaments[tournamentId] = matchUpDailyLimits;
    Object.assign(participants, participantDailyLimits ?? {});
  });

  return { matchUpDailyLimits: dailyLimits, dailyLimitOverrides: { tournaments, participants } };
}

export function getDailyLimit(params): ResultType & {
  participantDailyLimits?: { [participantId: string]: DailyLimits };
  matchUpDailyLimits?: DailyLimits;
} {
  const paramCheck = checkRequiredParameters(params, [{ [TOURNAMENT_RECORD]: true }]);
  if (paramCheck.error) return paramCheck;

  const { tournamentRecord } = params;
  const { policy } = findPolicy({
    policyType: POLICY_TYPE_SCHEDULING,
    tournamentRecord,
  });

  const limitsValue = firstClassGroupLeafOrExtension({
    element: tournamentRecord,
    groupAttribute: 'scheduling',
    leafAttribute: 'dailyLimits',
    name: SCHEDULE_LIMITS,
  });

  const tournamentDailyLimits = limitsValue?.dailyLimits;
  const policyDailyLimits = policy?.defaultDailyLimits;

  // the policy's per-participant overrides: [{ participantId, SINGLES?, DOUBLES?, total? }]
  const participantDailyLimits: { [participantId: string]: DailyLimits } = {};
  for (const entry of Array.isArray(policy?.matchUpDailyLimits) ? policy.matchUpDailyLimits : []) {
    const { participantId, ...limits } = entry ?? {};
    if (participantId) participantDailyLimits[participantId] = limits;
  }

  return { matchUpDailyLimits: tournamentDailyLimits || policyDailyLimits, participantDailyLimits };
}
