import { requireParams } from '@Helpers/parameters/requireParams';
import { findCourt } from '@Query/venues/findCourt';
import { makeDeepCopy } from '@Tools/makeDeepCopy';

import { TOURNAMENT_RECORD, COURT_ID } from '@Constants/attributeConstants';
import { ErrorType } from '@Constants/errorConditionConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { Tournament } from '@Types/tournamentTypes';

type GetCourtInfoArgs = {
  tournamentRecord: Tournament;
  internalUse?: boolean;
  courtId: string;
};
export function getCourtInfo({ tournamentRecord, internalUse, courtId }: GetCourtInfoArgs): {
  error?: ErrorType;
  success?: boolean;
  courtInfo?: any;
} {
  const paramsCheck = requireParams({ tournamentRecord, courtId }, [TOURNAMENT_RECORD, COURT_ID]);
  if (paramsCheck.error) return paramsCheck;

  const result = findCourt({ tournamentRecord, courtId });
  if (result.error) return result;

  const courtInfo =
    result.court &&
    (({
      altitude,
      courtId,
      courtName,
      courtDimensions,
      latitude,
      longitude,
      surfaceCategory,
      surfaceType,
      surfacedDate,
      pace,
      notes,
    }) => ({
      altitude,
      courtId,
      courtName,
      courtDimensions,
      latitude,
      longitude,
      surfaceCategory,
      surfaceType,
      surfacedDate,
      pace,
      notes,
    }))(result.court);

  return { ...SUCCESS, courtInfo: makeDeepCopy(courtInfo, false, internalUse) };
}
