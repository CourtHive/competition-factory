import { matchUpActions } from '@Query/drawDefinition/matchUpActions/matchUpActions';
import { isOperatorPresentationAudience } from './operatorPresentationSchema';
import { getMatchUpFormat } from '@Query/hierarchical/getMatchUpFormat';
import { resultEntryContext } from '@Query/matchUp/resultEntryContext';
import { findDrawMatchUp } from '@Acquire/findDrawMatchUp';
import { parse } from '@Helpers/matchUpFormatCode/parse';
import { findEvent } from '@Acquire/findEvent';

// constants and types
import { INVALID_VALUES, NOT_IMPLEMENTED } from '@Constants/errorConditionConstants';
import type { OperatorPresentationAudience } from '@Types/operatorPresentation';
import { CLEAR_SCORE, SCORE } from '@Constants/matchUpActionConstants';
import { DOUBLES, SINGLES } from '@Constants/matchUpTypes';
import type { Tournament } from '@Types/tournamentTypes';
import type { ResultType } from '@Types/factoryTypes';

type Unavailable = { state: 'unavailable'; reasonCode: 'ACTION_UNAVAILABLE' };
type InitialCandidate = { state: 'candidate'; intent: 'record-initial-result'; concurrency: 're-evaluate' };
type ReviewedCandidate = {
  state: 'candidate';
  intent: 'correct-result' | 'clear-result';
  concurrency: 'verify-reviewed';
};

/** Internal preparation result, deliberately NOT the v1 wire action (which says `offered` and needs a token). */
export type OperatorResultDecisionCandidates = {
  wireReady: false;
  audience: OperatorPresentationAudience;
  tournamentId: string;
  eventId: string;
  drawId: string;
  structureId: string;
  matchUpId: string;
  matchUpFormat: string;
  disabledMatchUpStatuses: string[];
  resultEntry: Unavailable | InitialCandidate | ReviewedCandidate;
  clearResult: Unavailable | ReviewedCandidate;
};

type Params = {
  tournamentRecord: Tournament;
  audience: OperatorPresentationAudience;
  matchUpId: string;
  drawId: string;
};

/**
 * INTERNAL / UNPUBLISHED. No readModel root export or browser type subpath is added.
 * Resolve from one explicitly supplied source and call canonical matchUpActions; never copy its eligibility rules.
 * Detached cloning protects immutable committed input from legacy query decoration and configurable copy settings.
 * Candidates still need canonical reviewed dependencies, validity and live capabilities before becoming wire offers.
 */
export function operatorResultDecisions(
  params?: Params,
): ResultType & { candidates?: OperatorResultDecisionCandidates } {
  if (
    !params ||
    !isOperatorPresentationAudience(params.audience) ||
    !validId(params.drawId) ||
    !validId(params.matchUpId) ||
    !validId(params.tournamentRecord?.tournamentId)
  )
    return { error: INVALID_VALUES };

  const { audience, drawId, matchUpId } = params;
  let tournamentRecord: Tournament;
  try {
    tournamentRecord = structuredClone(params.tournamentRecord);
  } catch {
    return { error: INVALID_VALUES };
  }
  const found = findEvent({ tournamentRecord, drawId });
  if (found.error) return { error: found.error };
  const { event, drawDefinition } = found;
  if (!event || !drawDefinition) return { error: INVALID_VALUES };
  const located = findDrawMatchUp({ drawDefinition, matchUpId, event });
  if (located.error) return { error: located.error };
  const { matchUp, structure } = located;
  if (!matchUp || !structure) return { error: INVALID_VALUES };
  const matchUpType = matchUp.matchUpType ?? event.eventType;
  if (
    ![SINGLES, DOUBLES].includes(matchUpType as typeof SINGLES | typeof DOUBLES) ||
    matchUp.collectionId ||
    matchUp.tieMatchUps?.length ||
    event.eventType === 'TEAM'
  )
    return { error: NOT_IMPLEMENTED };

  const format = getMatchUpFormat({ tournamentRecord, drawDefinition, matchUpId, event });
  if (format.error) return { error: format.error };
  if (!validId(format.matchUpFormat) || !parse(format.matchUpFormat)) return { error: NOT_IMPLEMENTED };
  const actions = matchUpActions({ tournamentRecord, drawDefinition, matchUpId, event });
  if (actions.error) return { error: actions.error };
  const score = actions.validActions?.find((action) => action.type === SCORE);
  const clear = actions.validActions?.some((action) => action.type === CLEAR_SCORE);
  const { requiresReview } = resultEntryContext(matchUp);
  const unavailable = (): Unavailable => ({ state: 'unavailable', reasonCode: 'ACTION_UNAVAILABLE' });
  return {
    candidates: {
      wireReady: false,
      audience,
      tournamentId: tournamentRecord.tournamentId,
      eventId: event.eventId,
      structureId: structure.structureId,
      drawId,
      matchUpId,
      matchUpFormat: format.matchUpFormat,
      disabledMatchUpStatuses: (score?.disabledMatchUpStatuses ?? []).filter(
        (status: unknown): status is string => typeof status === 'string',
      ),
      resultEntry: score ? entryCandidate(requiresReview) : unavailable(),
      clearResult: clear
        ? { state: 'candidate', intent: 'clear-result', concurrency: 'verify-reviewed' }
        : unavailable(),
    },
  };
}

function entryCandidate(requiresReview: boolean): InitialCandidate | ReviewedCandidate {
  return requiresReview
    ? { state: 'candidate', intent: 'correct-result', concurrency: 'verify-reviewed' }
    : { state: 'candidate', intent: 'record-initial-result', concurrency: 're-evaluate' };
}

function validId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}
