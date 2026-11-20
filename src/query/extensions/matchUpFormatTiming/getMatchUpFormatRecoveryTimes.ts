import { findMatchupFormatRecoveryTimes } from '@Acquire/findMatchUpFormatTimes';
import { findCategoryTiming } from '@Acquire/findCategoryTiming';
import { eventOverrideMinutes } from './eventOverrideMinutes';

export function getMatchUpFormatRecoveryTimes({
  tournamentScheduling,
  eventScheduling,
  averageMinutes,
  defaultTiming,
  matchUpFormat,
  categoryName,
  categoryType,
  policy,
}) {
  const eventRecoveryTimes =
    eventScheduling?.matchUpRecoveryTimes &&
    findMatchupFormatRecoveryTimes({
      ...eventScheduling,
      averageMinutes,
      matchUpFormat,
    })?.map(eventOverrideMinutes);

  const tournamentRecoveryTimes =
    tournamentScheduling?.matchUpRecoveryTimes &&
    findMatchupFormatRecoveryTimes({
      ...tournamentScheduling,
      averageMinutes,
      matchUpFormat,
    });

  const policyRecoveryTimes =
    policy?.matchUpRecoveryTimes &&
    findMatchupFormatRecoveryTimes({
      ...policy,
      averageMinutes,
      matchUpFormat,
    });

  const timesBlockArray = [
    eventRecoveryTimes,
    tournamentRecoveryTimes,
    policyRecoveryTimes,
    policy?.defaultTimes?.recoveryTimes,
    defaultTiming?.recoveryTimes,
  ];

  return findCategoryTiming({
    categoryName,
    categoryType,
    timesBlockArray,
  });
}
