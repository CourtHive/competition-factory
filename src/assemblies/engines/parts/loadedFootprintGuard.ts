import { FOOTPRINT_NOT_LOADED } from '@Constants/errorConditionConstants';
import { getMethodFootprint } from '@Query/footprint/mutationFootprints';
import { footprintCovers } from '@Query/footprint/footprintCovers';
import { getLoadedFootprint } from '@Global/state/loadedFootprint';
import { getOutcomePipeline } from '@Global/state/globalState';

type CheckLoadedFootprintArgs = {
  tournamentRecords?: { [key: string]: any };
  params?: { [key: string]: any };
  tournamentId?: string;
  methodName: string;
};

/**
 * Partial-record mode: a record marked with what was loaded of it (`engine.loadedFootprint`) refuses a method whose
 * declared footprint needs more, BEFORE anything runs. A method with no declared footprint needs the whole record, so it
 * is refused too: on a partial record a read of missing data gives a wrong answer, not an error. An unmarked record,
 * which is every record unless a caller marks it, is whole and is never checked.
 */
export function checkLoadedFootprint({
  methodName,
  params,
  tournamentRecords,
  tournamentId,
}: CheckLoadedFootprintArgs) {
  const recordId = params?.tournamentId ?? tournamentId;
  const tournamentRecord = recordId ? tournamentRecords?.[recordId] : undefined;
  const loaded = getLoadedFootprint(tournamentRecord);
  if (!loaded) return undefined;

  const required = getMethodFootprint(methodName, params, { outcomePipeline: getOutcomePipeline() });
  const missing = footprintCovers({ required, loaded, tournamentRecord });
  if (!missing.length) return undefined;

  return { error: FOOTPRINT_NOT_LOADED, context: { methodName, missing, drawIds: required.drawIds } };
}
