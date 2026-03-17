import { tallyParticipantResults } from '@Query/matchUps/roundRobinTally/tallyParticipantResults';
import { getStructureSeedAssignments } from '@Query/structure/getStructureSeedAssignments';
import { getAllStructureMatchUps } from '@Query/matchUps/getAllStructureMatchUps';
import { getPositionAssignments } from '@Query/drawDefinition/positionsGetter';
import { getEventPublishStatus } from '@Query/event/getEventPublishStatus';
import { isVisiblyPublished } from '@Query/publishing/isEmbargoed';
import { getDrawIsPublished } from '@Query/publishing/getDrawIsPublished';
import { getStructureGroups } from '@Query/structure/getStructureGroups';
import { createSubOrderMap } from '@Query/structure/createSubOrderMap';
import { getPublishState } from '@Query/publishing/getPublishState';
import { structureSort } from '@Functions/sorters/structureSort';
import { findStructure } from '@Acquire/findStructure';
import { findExtension } from '@Acquire/findExtension';
import { makeDeepCopy } from '@Tools/makeDeepCopy';
import { xa } from '@Tools/extractAttributes';

// constants and types
import { ErrorType, MISSING_DRAW_DEFINITION, UNLINKED_STRUCTURES } from '@Constants/errorConditionConstants';
import { CONSOLATION, MAIN, PLAY_OFF, QUALIFYING } from '@Constants/drawDefinitionConstants';
import { PARTICIPANT_ID } from '@Constants/attributeConstants';
import { DISPLAY, TALLY } from '@Constants/extensionConstants';
import { PUBLIC_DISPLAY } from '@Constants/displayConstants';
import { TEAM_MATCHUP } from '@Constants/matchUpTypes';
import { PUBLIC } from '@Constants/timeItemConstants';
import { SUCCESS } from '@Constants/resultConstants';
import {
  BYE,
  CANCELLED,
  COMPLETED,
  completedMatchUpStatuses,
  DEFAULTED,
  DOUBLE_DEFAULT,
  DOUBLE_WALKOVER,
  IN_PROGRESS,
  RETIRED,
  WALKOVER,
} from '@Constants/matchUpStatusConstants';

// NOTE: if { usePublishState: true } then { eventPublishedState } or { event } must be provided
export function getDrawData(params): {
  structures?: any[];
  success?: boolean;
  error?: ErrorType;
  drawInfo?: any;
} {
  const {
    tournamentParticipants = [],
    includePositionAssignments,
    policyDefinitions,
    tournamentRecord,
    inContext = true,
    usePublishState,
    status = PUBLIC,
    pressureRating,
    refreshResults,
    contextProfile,
    drawDefinition,
    noDeepCopy,
    sortConfig,
    context,
    event,
  } = params;

  if (!drawDefinition) return { error: MISSING_DRAW_DEFINITION };

  const { matchUpFormat, updatedAt, drawType, drawName, drawId } = drawDefinition;
  const drawInfo: any = {
    matchUpFormat,
    updatedAt,
    drawName,
    drawType,
    drawId,
  };

  drawInfo.display = findExtension({ element: drawDefinition, name: DISPLAY }).extension?.value;

  const qualificationStageSeedAssignments = {};
  let mainStageSeedAssignments, report;

  const { allStructuresLinked, sourceStructureIds, hasDrawFeedProfile, structureGroups } = getStructureGroups({
    drawDefinition,
  });

  if (!allStructuresLinked) return { error: UNLINKED_STRUCTURES };

  const eventPublishState = params?.eventPublishState ?? getPublishState({ event }).publishState;
  const publishStatus = params?.publishStatus ?? getEventPublishStatus({ event, status });
  const drawDetails = eventPublishState?.status?.drawDetails?.[drawDefinition.drawId];
  const eventPublished = !!eventPublishState?.status?.published;
  const structureDetails = drawDetails?.structureDetails;

  let drawActive = false;
  let participantPlacements = false; // if any positionAssignments include a participantId
  const groupedStructures = structureGroups.map((structureIds) => {
    const completedStructures = {};
    const structures = structureIds
      .map((structureId) => {
        const { structure } = findStructure({ drawDefinition, structureId });
        const { seedAssignments } = getStructureSeedAssignments({
          drawDefinition,
          structure,
        });

        // capture the seedAssignments for MAIN/QUALIFYING { stageSequence: 1 }
        if (structure?.stage === MAIN && structure.stageSequence === 1) {
          mainStageSeedAssignments = seedAssignments;
        }
        if (structure?.stage === QUALIFYING) {
          qualificationStageSeedAssignments[structure.stageSequence ?? 0] = seedAssignments;
        }

        return structure;
      })
      .sort((a, b) => structureSort(a, b, sortConfig))
      .map((structure) => {
        if (!structure) return undefined;
        const structureId = structure?.structureId;
        let seedAssignments = [];

        // pass seedAssignments from { stageSequence: 1 } to other stages
        if (structure.stage && [MAIN, CONSOLATION, PLAY_OFF].includes(structure.stage)) {
          seedAssignments = mainStageSeedAssignments;
        }

        if (structure?.stage === QUALIFYING) {
          seedAssignments = qualificationStageSeedAssignments[structure.stageSequence ?? 0];
        }

        const { matchUps, roundMatchUps, roundProfile } = getAllStructureMatchUps({
          // only propagate seedAssignments where none are present
          seedAssignments: structure?.seedAssignments?.length ? undefined : seedAssignments,
          context: { drawId: drawInfo.drawId, ...context },
          hydrateParticipants: params.hydrateParticipants,
          participantsProfile: params.participantsProfile,
          tournamentParticipants,
          policyDefinitions,
          tournamentRecord,
          usePublishState,
          publishStatus,
          contextProfile,
          drawDefinition,
          inContext,
          structure,
          event,
        });

        const { positionAssignments } = getPositionAssignments({ structure });

        let participantResults = positionAssignments?.filter(xa(PARTICIPANT_ID)).map((assignment) => {
          const participantResult = findExtension({ element: assignment, name: TALLY })?.extension?.value;
          const { drawPosition, participantId } = assignment;
          participantPlacements = true;

          return {
            participantResult,
            participantId,
            drawPosition,
          };
        });

        if (
          matchUps.length &&
          ((!participantResults?.length && params.allParticipantResults) || // don't override existing participantResults, unless { refreshresults: true }
            (refreshResults && !structure.structures)) // cannot refresh for round roubins
        ) {
          const { subOrderMap } = createSubOrderMap({ positionAssignments });

          const hasTeamMatchUps = matchUps.some((matchUp) => matchUp.matchUpType === TEAM_MATCHUP);
          const consideredMatchUps = hasTeamMatchUps
            ? matchUps.filter((matchUp) => matchUp.matchUpType === TEAM_MATCHUP)
            : matchUps;
          const result = tallyParticipantResults({
            matchUpFormat: structure.matchUpFormat,
            matchUps: consideredMatchUps,
            policyDefinitions,
            pressureRating,
            subOrderMap,
          });
          report = result?.report;

          participantResults = positionAssignments?.filter(xa(PARTICIPANT_ID)).map((assignment) => {
            const { drawPosition, participantId } = assignment;
            participantPlacements = true;

            return {
              participantResult: participantId && result?.participantResults?.[participantId],
              participantId,
              drawPosition,
            };
          });
        }

        const structureInfo: any = structure
          ? {
              stageSequence: structure.stageSequence,
              structureName: structure.structureName,
              structureType: structure.structureType,
              finishingPosition: structure.finishingPosition,
              matchUpFormat: structure.matchUpFormat,
              stage: structure.stage,
            }
          : {};

        const displaySettings = findExtension({ element: structure, name: DISPLAY }).extension?.value;
        structureInfo.display = displaySettings?.[PUBLIC_DISPLAY] ?? displaySettings;
        structureInfo.sourceStructureIds = sourceStructureIds[structureId];
        structureInfo.hasDrawFeedProfile = hasDrawFeedProfile[structureId];
        structureInfo.positionAssignments = positionAssignments;

        structureInfo.structureActive = matchUps.reduce((active, matchUp) => {
          const structureActiveStatuses = [
            DOUBLE_WALKOVER,
            DOUBLE_DEFAULT,
            IN_PROGRESS,
            COMPLETED,
            CANCELLED,
            DEFAULTED,
            RETIRED,
            WALKOVER,
          ].includes(matchUp.matchUpStatus);
          return active || structureActiveStatuses || !!matchUp.winningSide || !!matchUp.score?.scoreStringSide1;
        }, false);

        const structureCompleted = matchUps.every((matchUp) =>
          [...completedMatchUpStatuses, BYE].includes(matchUp.matchUpStatus),
        );
        structureInfo.structureCompleted = structureCompleted;
        completedStructures[structureId] = structureCompleted;

        if (structureInfo.structureActive) drawActive = true;

        return {
          ...structureInfo,
          participantResults,
          seedAssignments,
          roundMatchUps,
          roundProfile,
          structureId,
          report,
        };
      });

    // cleanup attribute used for sorting
    structures.forEach((structure) => {
      if (!includePositionAssignments) delete structure.positionAssignments;
      structure.sourceStructuresComplete = structure.sourceStructureIds?.every((id) => completedStructures[id]);
    });

    return structures;
  });

  // to support legacy publish status which did not support discrete structure publishing...
  // ...default to true when no structureDetails are found
  const structures = groupedStructures
    .flat()
    .filter((structure) => !usePublishState || isVisiblyPublished(structureDetails?.[structure?.structureId]) || true);

  drawInfo.drawActive = drawActive;
  drawInfo.participantPlacements = participantPlacements;
  drawInfo.drawGenerated = structures?.reduce((generated, structure) => {
    return generated || !!structure?.roundMatchUps;
  }, false);
  drawInfo.drawCompleted = structures?.reduce(
    (completed, structure) => completed && structure.structureCompleted,
    true,
  );
  drawInfo.drawPublished = usePublishState
    ? eventPublished && getDrawIsPublished({ publishStatus, drawId: drawInfo.drawId })
    : undefined;

  return {
    structures:
      !usePublishState || drawInfo.drawPublished
        ? (noDeepCopy && structures) || makeDeepCopy(structures, false, true)
        : undefined,
    drawInfo: noDeepCopy ? drawInfo : makeDeepCopy(drawInfo, false, true),
    ...SUCCESS,
  };
}
