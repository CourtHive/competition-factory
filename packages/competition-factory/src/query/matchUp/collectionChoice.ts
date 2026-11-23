import { matchUpTypeOptionsErrors, unresolvedCollectionChoice } from '@Helpers/matchUpTypeOptions';
import type { DrawDefinition, Event, MatchUp, MatchUpStatusUnion } from '@Types/tournamentTypes';
import { START_TIME, STOP_TIME, RESUME_TIME, END_TIME } from '@Constants/timeItemConstants';
import { resolveTieFormat } from '@Query/hierarchical/tieFormats/resolveTieFormat';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import type { MatchUpsMap, ResultType } from '@Types/factoryTypes';
import { TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';
import { findDrawMatchUp } from '@Acquire/findDrawMatchUp';

/** Time items that record play on a line; a choice must be resolved before any is written. */
export const PLAY_TIME_ITEM_TYPES = new Set<string>([START_TIME, STOP_TIME, RESUME_TIME, END_TIME]);

/** Read raw hierarchy only: refusals must not hydrate/write edges or allocate pair participants. */
export function collectionChoiceRefusal({
  drawDefinition,
  event,
  matchUpId,
  matchUp,
  matchUpsMap,
}: {
  drawDefinition?: DrawDefinition;
  event?: Event;
  matchUpId?: string;
  matchUp?: MatchUp;
  matchUpsMap?: MatchUpsMap;
}): ResultType | undefined {
  if (!drawDefinition || (matchUp && !matchUp.collectionId)) return undefined;
  const map = matchUpsMap ?? getMatchUpsMap({ drawDefinition });
  const child = matchUp ?? map.drawMatchUps.find((candidate) => candidate.matchUpId === matchUpId);
  if (!child?.collectionId) return undefined;
  const parent = map.drawMatchUps.find((candidate) =>
    candidate.tieMatchUps?.some((line) => line.matchUpId === child.matchUpId),
  );
  if (!parent) return undefined;
  const { structure } = findDrawMatchUp({ drawDefinition, matchUpId: parent.matchUpId, matchUpsMap: map });
  const tieFormat = resolveTieFormat({ matchUp: parent, drawDefinition, structure, event }).tieFormat;
  const collection = tieFormat?.collectionDefinitions.find(
    (definition) => definition.collectionId === child.collectionId,
  );
  if (collection?.matchUpTypeOptions === undefined) return undefined;
  if (
    unresolvedCollectionChoice(collection) ||
    matchUpTypeOptionsErrors(collection).length ||
    child.matchUpType !== collection.matchUpType
  )
    return {
      error: INVALID_VALUES,
      info: 'Resolve the collection matchUpType choice before assigning, scoring or starting its rubbers',
      context: { collectionId: collection.collectionId, matchUpId: child.matchUpId },
    };
  return undefined;
}

export function collectionChoiceScheduleRefusal(
  params: Parameters<typeof collectionChoiceRefusal>[0] & {
    schedule: Record<string, unknown>;
  },
): ResultType | undefined {
  if (
    !['startTime', 'stopTime', 'resumeTime', 'endTime'].some(
      (key) => params.schedule[key] !== undefined && params.schedule[key] !== null && params.schedule[key] !== '',
    )
  )
    return undefined;
  return collectionChoiceRefusal(params);
}

type ChoiceOutcome = {
  matchUpStatus?: MatchUpStatusUnion;
  winningSide?: number;
  score?: MatchUp['score'];
};

/** Clearing an untouched/unresolved line is legal; creating a result or starting play is not. */
export function collectionChoiceOutcomeRefusal(
  params: Parameters<typeof collectionChoiceRefusal>[0] &
    ChoiceOutcome & {
      outcome?: ChoiceOutcome;
      removeScore?: boolean;
    },
): ResultType | undefined {
  const outcome = params.outcome ?? params;
  const clearing = params.removeScore || outcome.matchUpStatus === TO_BE_PLAYED;
  if (
    clearing &&
    outcome.score === undefined &&
    outcome.winningSide === undefined &&
    (outcome.matchUpStatus === undefined || outcome.matchUpStatus === TO_BE_PLAYED)
  )
    return undefined;
  return collectionChoiceRefusal(params);
}
