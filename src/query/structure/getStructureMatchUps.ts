import { structureAssignedDrawPositions } from '@Query/drawDefinition/positionsGetter';
import { getAllStructureMatchUps } from '@Query/matchUps/getAllStructureMatchUps';
import { matchUpCompletion } from '@Query/matchUp/checkMatchUpIsComplete';
import { findStructure } from '@Acquire/findStructure';

// constants and types
import { DrawDefinition, Event, Participant, Structure, Tournament } from '@Types/tournamentTypes';
import { ABANDONED, upcomingMatchUpStatuses } from '@Constants/matchUpStatusConstants';
import { HydratedMatchUp } from '@Types/hydrated';
import { TEAM } from '@Constants/matchUpTypes';
import {
  ContextContent,
  ContextProfile,
  ExitProfiles,
  MatchUpFilters,
  MatchUpsMap,
  ParticipantMap,
  PolicyDefinitions,
  ResultType,
  ScheduleTiming,
  ScheduleVisibilityFilters,
} from '@Types/factoryTypes';

/*
  completedMatchUps are those matchUps where a winningSide is defined
  upcomingMatchUps are those matchUps where both drawPositions are defined
  ===> If requireParticipants then upcmoingMatchUps require drawPositions to be assigned
  pendingMatchUps are those matchUps where a drawPosition is undefined
  *AND* where both drawPositions map to assigned participantIds
*/

type GroupsMatchUpsResult = {
  abandonedMatchUps?: HydratedMatchUp[];
  completedMatchUps?: HydratedMatchUp[];
  upcomingMatchUps?: HydratedMatchUp[];
  pendingMatchUps?: HydratedMatchUp[];
  byeMatchUps?: HydratedMatchUp[];
  includesTeamMatchUps?: boolean;
  structure?: Structure;
};

type GetStructureMatchUpsArgs = {
  scheduleVisibilityFilters?: ScheduleVisibilityFilters;
  tournamentAppliedPolicies?: PolicyDefinitions;
  tournamentParticipants?: Participant[];
  policyDefinitions?: PolicyDefinitions;
  context?: { [key: string]: any };
  matchUpFilters?: MatchUpFilters;
  contextFilters?: MatchUpFilters;
  contextContent?: ContextContent;
  participantMap?: ParticipantMap;
  scheduleTiming?: ScheduleTiming;
  hydrateParticipants?: boolean;
  requireParticipants?: boolean;
  tournamentRecord?: Tournament;
  contextProfile?: ContextProfile;
  drawDefinition?: DrawDefinition;
  afterRecoveryTimes?: boolean;
  usePublishState?: boolean;
  exitProfiles?: ExitProfiles;
  matchUpsMap?: MatchUpsMap;
  structure?: Structure;
  structureId?: string;
  inContext?: boolean;
  publishStatus?: any;
  event?: Event;
};

export function getStructureMatchUps({
  requireParticipants = true,
  scheduleVisibilityFilters,
  tournamentAppliedPolicies,
  tournamentParticipants,
  hydrateParticipants,
  afterRecoveryTimes,
  policyDefinitions,
  tournamentRecord,
  usePublishState,
  matchUpFilters,
  contextFilters,
  contextContent,
  participantMap,
  scheduleTiming,
  publishStatus,
  contextProfile,
  drawDefinition,
  exitProfiles,
  matchUpsMap,
  structureId,
  inContext,
  structure,
  context,
  event,
}: GetStructureMatchUpsArgs): ResultType & GroupsMatchUpsResult {
  if (!structure && structureId) {
    ({ structure } = findStructure({ drawDefinition, structureId }));
  }

  const result = getAllStructureMatchUps({
    tournamentAppliedPolicies,
    scheduleVisibilityFilters,
    tournamentParticipants,
    hydrateParticipants,
    afterRecoveryTimes,
    policyDefinitions,
    tournamentRecord,
    usePublishState,
    matchUpFilters,
    contextFilters,
    contextContent,
    participantMap,
    scheduleTiming,
    publishStatus,
    contextProfile,
    drawDefinition,
    exitProfiles,
    matchUpsMap,
    structure,
    inContext,
    context,
    event,
  });

  const abandonedMatchUps: HydratedMatchUp[] = [];
  const completedMatchUps: HydratedMatchUp[] = [];
  const upcomingMatchUps: HydratedMatchUp[] = [];
  const pendingMatchUps: HydratedMatchUp[] = [];
  const byeMatchUps: HydratedMatchUp[] = [];

  if (result.error) return result;
  const { matchUps } = result;

  const { assignedPositions } = structureAssignedDrawPositions({ structure });
  const participantAssignedDrawPositions = assignedPositions
    ?.filter((assignment) => assignment.participantId)
    .map((assignment) => assignment.drawPosition);

  let includesTeamMatchUps;

  matchUps
    .filter((matchUp) => {
      const teamsMatchUpsOnly = matchUpFilters?.matchUpTypes?.length === 1 && matchUpFilters.matchUpTypes[0] === TEAM;
      return !(matchUp.matchUpType !== TEAM && teamsMatchUpsOnly);
    })
    .forEach((matchUp) => {
      if (matchUp.matchUpStatus === ABANDONED) {
        abandonedMatchUps.push(matchUp);
        return;
      }

      if (matchUp.matchUpType === TEAM) includesTeamMatchUps = true;

      const isCollectionMatchUp = Boolean(matchUp.collectionId);
      const collectionSidesAssigned = isCollectionMatchUp && matchUp.sides?.every((side) => side.participantId);

      const drawPositionsFilled = !isCollectionMatchUp && matchUp.drawPositions?.filter(Boolean).length === 2;
      const drawPositionsAssigned =
        !isCollectionMatchUp &&
        matchUp.drawPositions?.every((drawPosition) => participantAssignedDrawPositions?.includes(drawPosition));

      const byeAssignedDrawPositions = assignedPositions
        ?.filter((assignment) => assignment.bye)
        .map((assignment) => assignment.drawPosition);

      const isByeMatchUp =
        !isCollectionMatchUp &&
        matchUp.drawPositions?.find((drawPosition) => byeAssignedDrawPositions?.includes(drawPosition));

      const validUpcomingMatchUpStatus = upcomingMatchUpStatuses.includes(matchUp.matchUpStatus);
      const isUpcomingMatchUp =
        validUpcomingMatchUpStatus &&
        (collectionSidesAssigned || (drawPositionsFilled && (!requireParticipants || drawPositionsAssigned)));

      if (isByeMatchUp) return byeMatchUps.push(matchUp);
      if (matchUpCompletion(matchUp)) return completedMatchUps.push(matchUp);
      if (isUpcomingMatchUp) return upcomingMatchUps.push(matchUp);
      return pendingMatchUps.push(matchUp);
    });

  return {
    includesTeamMatchUps,
    abandonedMatchUps,
    completedMatchUps,
    upcomingMatchUps,
    pendingMatchUps,
    byeMatchUps,
    structure,
  };
}
