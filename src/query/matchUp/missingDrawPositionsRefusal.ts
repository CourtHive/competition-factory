import { isDrawnResult } from '@Query/matchUps/roundRobinTally/drawnResults';
import { resolveScoringFormat } from '@Query/hierarchical/resolveScoringFormat';
import { isRotatingPartnerDraw } from '@Validators/rotatingPartnerDraw';
import { decorateResult } from '@Functions/global/decorateResult';
import { isAdHoc } from '@Query/drawDefinition/isAdHoc';
import { isDoubleExit, isExit } from '@Validators/isExit';

// constants and types
import type { DrawDefinition, Event, MatchUp, MatchUpStatusUnion, Structure } from '@Types/tournamentTypes';
import { MISSING_DRAW_POSITIONS } from '@Constants/errorConditionConstants';
import { COMPLETED } from '@Constants/matchUpStatusConstants';
import { WIN_RATIO } from '@Constants/drawDefinitionConstants';

type UndirectedDrawnOutcomeParams = Readonly<{
  drawDefinition?: Readonly<
    Pick<DrawDefinition, 'drawId' | 'drawType' | 'matchUpType' | 'competitionProfile' | 'matchUpFormat'>
  >;
  event?: Readonly<Pick<Event, 'eventId' | 'eventType' | 'matchUpFormat'>>;
  inContextMatchUp?: Readonly<Pick<MatchUp, 'matchUpFormat'>>;
  matchUp?: Readonly<Pick<MatchUp, 'matchUpFormat'>>;
  structure?: Readonly<Structure>;
  matchUpStatus?: MatchUpStatusUnion;
  score?: MatchUp['score'];
  matchUpFormat?: string;
  winningSide?: number;
  matchUpId?: string;
}>;

/**
 * A WINNER WITH NO DRAWPOSITIONS TO DIRECT FROM IS REFUSED BEFORE THE FIRST WRITE.
 *
 * `directParticipants` refused `MISSING_DRAW_POSITIONS` only after `attemptToModifyScore` had written the score and the
 * winner: measured on `dev` 01ce40e544, a SINGLE_ELIMINATION matchUp stored without `drawPositions`, scored under
 * `requireParticipantsForScoring: false`, returned the error over a written result (CA, 2026-10-22: an error leaves the
 * record unchanged, and no mutation relies on rollback). The same question, asked of the same matchUp, on the route
 * that reaches it: a matchUp that has sent nothing (so neither the swap nor the downstream-dependency route), not a
 * line of a dual, not ad hoc, given a winner or an exit to carry. Read before anything is written, so it cannot drift
 * from what `directParticipants` reads.
 */
/** what `missingDrawPositionsRefusal` reads of the call: the outcome view (v2) asks it with the same values */
export type MissingDrawPositionsParams = UndirectedDrawnOutcomeParams & {
  readonly matchUp: Readonly<
    Pick<MatchUp, 'drawPositions' | 'collectionId' | 'winningSide' | 'matchUpStatus' | 'matchUpFormat'>
  >;
  readonly propagateExitStatus?: boolean;
};

export function missingDrawPositionsRefusal({
  activeDownstream,
  params,
}: {
  params: MissingDrawPositionsParams;
  activeDownstream: boolean;
}) {
  const { matchUp, structure, matchUpStatus } = params;
  if (matchUp.drawPositions || matchUp.collectionId || isAdHoc({ structure })) return undefined;
  if (matchUp.winningSide || isDoubleExit(matchUp.matchUpStatus)) return undefined;
  const directs = !!params.winningSide || (!!params.propagateExitStatus && isExit(matchUpStatus));
  if (!directs || isUndirectedDrawnOutcome(params, activeDownstream)) return undefined;
  return decorateResult({ result: { error: MISSING_DRAW_POSITIONS }, stack: 'setMatchUpStatus' });
}

/**
 * A drawn result where no winner is needed (a round robin, an ad hoc draw, rotating partners) retains its score without
 * removing directed positions: a level combined total, or a level finish of a format that can end level (§ 9.7).
 */
export function isUndirectedDrawnOutcome(params: UndirectedDrawnOutcomeParams, activeDownstream: boolean): boolean {
  const format = resolveScoringFormat({ ...params, incoming: params.matchUpFormat });
  const noWinnerNeeded =
    params.structure?.finishingPosition === WIN_RATIO ||
    isAdHoc({ structure: params.structure }) ||
    isRotatingPartnerDraw(params.drawDefinition, params.event);
  return (
    !activeDownstream &&
    !params.winningSide &&
    noWinnerNeeded &&
    isDrawnResult({
      matchUpId: params.matchUpId ?? '',
      matchUpStatus: params.matchUpStatus ?? COMPLETED,
      score: params.score,
      winningSide: params.winningSide,
      matchUpFormat: format,
    })
  );
}
