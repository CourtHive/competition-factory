import { rereadTargets } from '@Mutate/drawDefinitions/matchUpGovernor/rereadTargets';
import { withdrawDirectedPositions } from './removeDirectedParticipants';
import { directScoredParticipants } from './directParticipants';
import { isAdHoc } from '@Query/drawDefinition/isAdHoc';
import type { ResultType } from '@Types/factoryTypes';
import { SUCCESS } from '@Constants/resultConstants';

/** A line entered without a winner may still decide its dual on the other lines. */
export function placeRetalliedWinner(
  params,
  winningSide: number | undefined,
  previousDirectionWithdrawn = false,
): ResultType {
  const priorWinner = params.targetData?.matchUp?.winningSide;
  if (params.winningSide || !winningSide || priorWinner === winningSide || isAdHoc(params)) return SUCCESS;
  const targets = params.targetData?.targetMatchUps;
  if (!targets?.winnerMatchUp && !targets?.loserMatchUp && !targets?.byeMatchUp) return SUCCESS;
  if (priorWinner && !previousDirectionWithdrawn) {
    const withdrawn = withdrawDirectedPositions({ ...params, matchUpId: params.matchUpTieId });
    if (withdrawn.error) return withdrawn;
  }
  rereadTargets(params);
  return directScoredParticipants(
    { ...params, projectedWinningSide: winningSide, winningSide },
    params.targetData.matchUp.drawPositions,
    undefined,
    'placeRetalliedWinner',
  );
}
