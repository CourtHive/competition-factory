import { CANNOT_MODIFY_TIEFORMAT, INVALID_VALUES, NOT_IMPLEMENTED } from '@Constants/errorConditionConstants';
import { START_TIME, STOP_TIME, RESUME_TIME, END_TIME } from '@Constants/timeItemConstants';
import { completedMatchUpStatuses, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { requiredForkIds, writeTieFormat } from '@Mutate/tieFormat/writeTieFormat';
import { modifyMatchUpNotice } from '@Mutate/notifications/drawNotifications';
import { getTeamLineUp } from '@Query/drawDefinition/getTeamLineUp';
import { findDrawMatchUp } from '@Acquire/findDrawMatchUp';
import { SINGLES, DOUBLES } from '@Constants/matchUpTypes';
import type { ResultType } from '@Types/factoryTypes';
import { SUCCESS } from '@Constants/resultConstants';
import { makeDeepCopy } from '@Tools/makeDeepCopy';
import type {
  CollectionDefinition,
  DrawDefinition,
  Event,
  MatchUp,
  TieFormat,
  Tournament,
  TeamCompetitor,
} from '@Types/tournamentTypes';

// Exploratory, encounter-scoped: no template fan-out and no implicit player conversion.
type TypeChangeArgs = {
  source: CollectionDefinition;
  matchUpType?: string;
  matchUpCount?: number;
  matchUp?: MatchUp;
  drawDefinition?: DrawDefinition;
  event?: Event;
  clearCollectionAssignments?: boolean;
  tieFormatUuids?: string[];
};

type TypeChangePlan = {
  matchUp: MatchUp;
  children: MatchUp[];
  lineUps: { sideNumber: number; lineUp: TeamCompetitor[] }[];
  collectionId: string;
  matchUpType: string;
  clearAssignments: boolean;
  tieFormatUuids?: string[];
};

type TypeChangeResult = ResultType & { plan?: TypeChangePlan };

export function planCollectionTypeChange(args: TypeChangeArgs): TypeChangeResult {
  const { source, matchUpType, matchUp, drawDefinition, event, matchUpCount, tieFormatUuids } = args;
  if (!matchUpType || source.matchUpType === matchUpType) return {};
  const refusal = (error: ResultType['error'], info: string) => ({ error, info });
  if (![SINGLES, DOUBLES].includes(matchUpType) || ![SINGLES, DOUBLES].includes(source.matchUpType ?? ''))
    return refusal(INVALID_VALUES, 'Only SINGLES and DOUBLES conversions are supported');
  if (args.clearCollectionAssignments !== undefined && typeof args.clearCollectionAssignments !== 'boolean')
    return refusal(INVALID_VALUES, 'clearCollectionAssignments must be a boolean');
  if (tieFormatUuids !== undefined && !Array.isArray(tieFormatUuids))
    return refusal(INVALID_VALUES, 'tieFormatUuids must be an array');
  if (
    tieFormatUuids?.some(
      (uuid) => typeof uuid !== 'string' || !uuid || event?.tieFormats?.some((format) => format.tieFormatId === uuid),
    )
  )
    return refusal(INVALID_VALUES, 'tieFormatUuids must contain new nonempty format ids');
  if (!matchUp || !drawDefinition)
    return refusal(NOT_IMPLEMENTED, 'Exploratory type conversion requires a TEAM matchUpId');
  if (matchUpCount !== undefined && matchUpCount !== source.matchUpCount)
    return refusal(INVALID_VALUES, 'Change collection type and count in separate operations');
  if (matchUp.winningSide || completedMatchUpStatuses.includes(matchUp.matchUpStatus!))
    return refusal(CANNOT_MODIFY_TIEFORMAT, 'An encounter with a result cannot change collection type');
  const children = (matchUp.tieMatchUps ?? []).filter((child) => child.collectionId === source.collectionId);
  if (children.length !== source.matchUpCount)
    return refusal(CANNOT_MODIFY_TIEFORMAT, 'Collection definition and rubber count disagree');
  if (children.some((child) => child.matchUpType !== source.matchUpType))
    return refusal(CANNOT_MODIFY_TIEFORMAT, 'Collection definition and rubber types disagree');
  if (children.some(played))
    return refusal(
      CANNOT_MODIFY_TIEFORMAT,
      'All affected rubbers must be unplayed and without a score or actual play times',
    );
  const needed = requiredForkIds({ targets: [matchUp], event });
  if (needed && (!tieFormatUuids || tieFormatUuids.length < needed))
    return refusal(INVALID_VALUES, 'Supply tieFormatUuids for a deterministic shared-format fork');
  const context = findDrawMatchUp({ drawDefinition, matchUpId: matchUp.matchUpId, event, inContext: true });
  if (context.error) return context;
  const lineUps: TypeChangePlan['lineUps'] = [1, 2].map((sideNumber) => {
    const side = context.matchUp?.sides?.find((side) => side.sideNumber === sideNumber);
    return {
      sideNumber,
      lineUp: makeDeepCopy(
        matchUp.sides?.find((raw) => raw.sideNumber === sideNumber)?.lineUp ??
          getTeamLineUp({ drawDefinition, participantId: side?.participantId }).lineUp ??
          [],
      ),
    };
  });
  const assigned =
    lineUps.some(({ lineUp }) =>
      lineUp.some((assignment) =>
        assignment.collectionAssignments?.some((entry) => entry.collectionId === source.collectionId),
      ),
    ) || children.some((child) => child.sides?.some((side) => side.participantId));
  if (assigned && !args.clearCollectionAssignments)
    return refusal(CANNOT_MODIFY_TIEFORMAT, 'Clear affected collection assignments explicitly before changing type');
  return {
    plan: {
      matchUp,
      children,
      lineUps,
      collectionId: source.collectionId,
      matchUpType,
      clearAssignments: !!args.clearCollectionAssignments,
      tieFormatUuids,
    },
  };
}

function played(child: MatchUp): boolean {
  return (
    child.matchUpStatus !== TO_BE_PLAYED ||
    !!child.winningSide ||
    !!child.score?.sets?.length ||
    !!child.schedule?.scoredTime ||
    !!child.score?.scoreStringSide1 ||
    !!child.score?.scoreStringSide2 ||
    !!child.timeItems?.some((item) => [START_TIME, STOP_TIME, RESUME_TIME, END_TIME].includes(item.itemType!))
  );
}

export function applyCollectionTypeChange({
  plan,
  tieFormat,
  event,
  drawDefinition,
  tournamentRecord,
}: {
  plan: TypeChangePlan;
  tieFormat: TieFormat;
  event?: Event;
  drawDefinition?: DrawDefinition;
  tournamentRecord?: Tournament;
}): ResultType & { tieFormat?: TieFormat; modifiedMatchUpsCount?: number; modifiedCount?: number } {
  const { matchUp, children, lineUps, collectionId, clearAssignments, tieFormatUuids } = plan;
  const result = writeTieFormat({ target: matchUp, tieFormat, event, uuids: tieFormatUuids });
  if (result?.error) return result;
  if (clearAssignments) {
    matchUp.sides ??= [];
    for (const { sideNumber, lineUp } of lineUps) {
      let side = matchUp.sides.find((side) => side.sideNumber === sideNumber);
      if (!side) {
        side = { sideNumber };
        matchUp.sides.push(side);
      }
      side.lineUp = lineUp.map((assignment) => ({
        ...assignment,
        collectionAssignments: assignment.collectionAssignments?.filter((entry) => entry.collectionId !== collectionId),
      }));
    }
  }
  for (const child of children) {
    child.matchUpType = plan.matchUpType as MatchUp['matchUpType'];
    if (clearAssignments) for (const side of child.sides ?? []) delete side.participantId;
    modifyMatchUpNotice({ matchUp: child, drawDefinition, event, tournamentId: tournamentRecord?.tournamentId });
  }
  modifyMatchUpNotice({ matchUp, drawDefinition, event, tournamentId: tournamentRecord?.tournamentId });
  return { ...SUCCESS, tieFormat, modifiedMatchUpsCount: 1, modifiedCount: 1 };
}
