import { findMatchupFormatAverageTimes } from '@Acquire/findMatchUpFormatTimes';
import { findCategoryTiming } from '@Acquire/findCategoryTiming';
import { eventOverrideMinutes } from './eventOverrideMinutes';

export function getMatchUpFormatAverageTimes({
  matchUpFormat,
  categoryName,
  categoryType,

  defaultTiming,
  tournamentScheduling,
  eventScheduling,
  policy,
}) {
  const eventAverageTimes =
    eventScheduling?.matchUpAverageTimes &&
    findMatchupFormatAverageTimes({
      ...eventScheduling,
      matchUpFormat,
    })?.map(eventOverrideMinutes);

  const tournamentAverageTimes =
    tournamentScheduling?.matchUpAverageTimes &&
    findMatchupFormatAverageTimes({
      ...tournamentScheduling,
      matchUpFormat,
    });

  const policyAverageTimes =
    policy?.matchUpAverageTimes &&
    findMatchupFormatAverageTimes({
      ...policy,
      matchUpFormat,
    });

  const timesBlockArray = [
    eventAverageTimes,
    tournamentAverageTimes,
    policyAverageTimes,
    policy?.defaultTimes?.averageTimes,
    defaultTiming?.averageTimes,
  ];

  return findCategoryTiming({
    categoryName,
    categoryType,
    timesBlockArray,
  });
}
