import { HydratedMatchUp } from '@Types/hydrated';

type ProcessNextMatchUpsArgs = {
  matchUpNotBeforeTimes: { [key: string]: any };
  timeAfterRecovery?: string;
  linkedTargetIds?: string[];
  matchUp: HydratedMatchUp;
};
export function processNextMatchUps({
  matchUpNotBeforeTimes,
  timeAfterRecovery,
  linkedTargetIds,
  matchUp,
}: ProcessNextMatchUpsArgs) {
  timeAfterRecovery = timeAfterRecovery ?? matchUp.schedule?.timeAfterRecovery;

  // It is necessary to only update timeAfterRecovery if value is greater...
  // ...to account for source matchUps having earlier timeAfterRecovery
  // e.g. roundPosition 1 matchUp timeAfterRecovery is 11:00 but
  // roundPosition 2 matchUp timeAfterRecovery is 9:30
  // and the last one to be processed shouldn't overwrite later value
  const updateNotBeforeTime = (matchUpId) => {
    if (
      timeAfterRecovery &&
      (!matchUpNotBeforeTimes[matchUpId] || timeAfterRecovery > matchUpNotBeforeTimes[matchUpId])
    ) {
      matchUpNotBeforeTimes[matchUpId] = timeAfterRecovery;
    }
  };

  const winnerMatchUpId = matchUp.winnerTo?.matchUpId || matchUp.winnerMatchUpId;
  if (winnerMatchUpId) {
    timeAfterRecovery && updateNotBeforeTime(winnerMatchUpId);
  }
  const loserMatchUpId = matchUp.loserTo?.matchUpId || matchUp.loserMatchUpId;
  if (loserMatchUpId) {
    timeAfterRecovery && updateNotBeforeTime(loserMatchUpId);
  }
  // a linked target (a qualifier position, a playoff fed by a round robin group) waits for this matchUp to end
  linkedTargetIds?.forEach((matchUpId) => timeAfterRecovery && updateNotBeforeTime(matchUpId));
  if (matchUp.sidesTo?.length) {
    matchUp.sidesTo.forEach(({ matchUpId }) => {
      if (matchUpId) {
        timeAfterRecovery && updateNotBeforeTime(matchUpId);
      }
    });
  }
}
