import { checkRequiredParameters } from '@Helpers/parameters/checkRequiredParameters';
import { getTournamentTimeItem } from '@Query/base/timeItems';
import { makeDeepCopy } from '@Tools/makeDeepCopy';

// constants
import { PUBLIC, PUBLISH, STATUS } from '@Constants/timeItemConstants';
import { TOURNAMENT_RECORD } from '@Constants/attributeConstants';
import type { TournamentPublishState } from '@Types/viewTypes';

export function getTournamentPublishStatus(params) {
  const paramsCheck = checkRequiredParameters(params, [{ [TOURNAMENT_RECORD]: true }]);
  if (paramsCheck.error) return paramsCheck;

  const { tournamentRecord, status = PUBLIC } = params;
  const itemType = `${PUBLISH}.${STATUS}`;
  // an empty status object when nothing has been published (the engines no longer turn an undefined answer into {})
  return (
    makeDeepCopy(
      (
        getTournamentTimeItem({
          tournamentRecord,
          itemType,
        })?.timeItem?.itemValue as Record<string, TournamentPublishState> | undefined
      )?.[status],
      false,
      true,
    ) ?? {}
  );
}
