import { getPositionAssignments, structureAssignedDrawPositions } from '@Query/drawDefinition/positionsGetter';
import { getSourceStructureIdsAndRelevantLinks } from '@Query/structure/getSourceStructureIdsAndRelevantLinks';
import { qualifierDrawPositionAssignment } from '@Mutate/matchUps/drawPositions/positionQualifier';
import { getQualifiersData } from '@Mutate/matchUps/drawPositions/positionQualifiers';
import { checkRequiredParameters } from '@Helpers/parameters/checkRequiredParameters';
import { getAllStructureMatchUps } from '@Query/matchUps/getAllStructureMatchUps';
import { isCompletedStructure } from '@Query/drawDefinition/structureActions';
import { getAppliedPolicies } from '@Query/extensions/getAppliedPolicies';
import { firstClassOrExtension } from '@Acquire/firstClassOrExtension';
import { decorateResult } from '@Functions/global/decorateResult';
import { mapNumbersToIndexes } from '@Tools/mapNumbersToIndexes';
import { definedAttributes } from '@Tools/definedAttributes';
import { ResultType } from '@Types/factoryTypes';
import { generateRange } from '@Tools/arrays';

// constants and types
import { DrawDefinition, Event, PositionAssignment, Structure, Tournament } from '@Types/tournamentTypes';
import { DRAW_DEFINITION, EVENT, TOURNAMENT_RECORD } from '@Constants/attributeConstants';
import { MAIN, POSITION, QUALIFYING, WINNER } from '@Constants/drawDefinitionConstants';
import { POLICY_TYPE_POSITION_ACTIONS } from '@Constants/policyConstants';
import { BYE } from '@Constants/matchUpStatusConstants';
import { TALLY } from '@Constants/extensionConstants';
import { SUCCESS } from '@Constants/resultConstants';
import {
  MISSING_MAIN_STRUCTURE,
  MISSING_QUALIFIED_PARTICIPANTS,
  NO_DRAW_POSITIONS_AVAILABLE_FOR_QUALIFIERS,
} from '@Constants/errorConditionConstants';

interface QualifierProgressionArgs {
  drawDefinition: DrawDefinition;
  tournamentRecord: Tournament;
  targetRoundNumber?: number;
  event: Event;
  randomList?: number[];
}

export function qualifierProgression({
  targetRoundNumber = 1,
  tournamentRecord,
  drawDefinition,
  event,
  randomList,
}: QualifierProgressionArgs): ResultType {
  const paramsCheck = checkRequiredParameters({ drawDefinition, event, tournamentRecord }, [
    { [DRAW_DEFINITION]: true, [EVENT]: true, [TOURNAMENT_RECORD]: true },
  ]);
  if (paramsCheck.error) return paramsCheck;

  const assignedParticipants: { participantId: string; drawPosition: number }[] = [];
  const qualifyingParticipantIds: string[] = [];

  const mainStructure = drawDefinition.structures?.find(
    (structure) => structure.stage === MAIN && structure.stageSequence === 1,
  );

  if (!mainStructure) return decorateResult({ result: { error: MISSING_MAIN_STRUCTURE } });

  const appliedPolicies =
    getAppliedPolicies({ tournamentRecord, drawDefinition, structure: mainStructure, event }).appliedPolicies ?? {};

  const policy = appliedPolicies[POLICY_TYPE_POSITION_ACTIONS];
  const requireCompletedStructures = policy?.requireCompletedStructures;

  const {
    qualifierPositions,
    positionAssignments,
  }: {
    qualifierPositions: { drawPosition: number; qualifier: boolean }[];
    positionAssignments: PositionAssignment[];
  } = structureAssignedDrawPositions({ structure: mainStructure });

  const targetQualifierPositions = qualifierPositionsForRound({
    structure: mainStructure,
    qualifierPositions,
    targetRoundNumber,
    drawDefinition,
  });

  if (!targetQualifierPositions.length)
    return decorateResult({ result: { error: NO_DRAW_POSITIONS_AVAILABLE_FOR_QUALIFIERS } });

  let qualifierPositionIndexes = generateRange(0, targetQualifierPositions.length);

  if (randomList) {
    qualifierPositionIndexes = mapNumbersToIndexes(qualifierPositionIndexes, randomList);
  }

  const assignedParticipantIds = positionAssignments.map((assignment) => assignment.participantId).filter(Boolean);

  const { relevantLinks: eliminationSourceLinks } =
    getSourceStructureIdsAndRelevantLinks({
      structureId: mainStructure.structureId,
      targetRoundNumber,
      linkType: WINNER, // links that traverse by ROUND: the winners of an elimination qualifying round
      drawDefinition,
    }) ?? {};

  const { relevantLinks: roundRobinSourceLinks } =
    getSourceStructureIdsAndRelevantLinks({
      structureId: mainStructure.structureId,
      targetRoundNumber,
      linkType: POSITION, // links that traverse by FINISHING POSITION: out of a round robin, labelled POSITION or WINNER
      drawDefinition,
    }) ?? {};

  collectEliminationQualifiers({
    eliminationSourceLinks,
    requireCompletedStructures,
    assignedParticipantIds,
    qualifyingParticipantIds,
    drawDefinition,
  });

  collectRoundRobinQualifiers({
    roundRobinSourceLinks,
    assignedParticipantIds,
    qualifyingParticipantIds,
    drawDefinition,
  });

  if (!qualifyingParticipantIds.length) return decorateResult({ result: { error: MISSING_QUALIFIED_PARTICIPANTS } });

  qualifierPositionIndexes.forEach((positionIndex, index) => {
    const participantToAssign = qualifyingParticipantIds[index];
    const drawPosition = targetQualifierPositions[positionIndex].drawPosition;
    if (participantToAssign) {
      const positionAssignmentResult: ResultType = qualifierDrawPositionAssignment({
        qualifyingParticipantId: participantToAssign,
        structureId: mainStructure.structureId,
        drawPosition,
        tournamentRecord,
        drawDefinition,
      });

      positionAssignmentResult?.success &&
        assignedParticipants.push({ participantId: participantToAssign, drawPosition });
    }
  });

  return decorateResult({
    result: definedAttributes({ ...SUCCESS, assignedParticipants }),
  });
}

/**
 * The qualifier positions that enter the main structure at the target round. Where qualifiers enter at more than one
 * round (a later-round qualifier takes a position a first round BYE advances), a position belongs to the LAST target
 * round whose drawPositions hold it: a qualifier position advances only by a BYE. Where every qualifier enters at one
 * round, all of them do.
 */
function qualifierPositionsForRound({
  qualifierPositions,
  targetRoundNumber,
  drawDefinition,
  structure,
}: {
  qualifierPositions: { drawPosition: number; qualifier: boolean }[];
  drawDefinition: DrawDefinition;
  targetRoundNumber: number;
  structure: Structure;
}) {
  const { roundDrawPositions } = getQualifiersData({ drawDefinition, structure });
  const targetRounds = Object.keys(roundDrawPositions ?? {}).map(Number);
  if (targetRounds.length < 2) return qualifierPositions;

  const entryRound = (drawPosition: number) =>
    Math.max(...targetRounds.filter((roundNumber) => roundDrawPositions[roundNumber].includes(drawPosition)));
  return qualifierPositions.filter(({ drawPosition }) => entryRound(drawPosition) === targetRoundNumber);
}

function collectEliminationQualifiers({
  eliminationSourceLinks,
  requireCompletedStructures,
  assignedParticipantIds,
  qualifyingParticipantIds,
  drawDefinition,
}) {
  for (const sourceLink of eliminationSourceLinks) {
    const structure = drawDefinition.structures?.find(
      (structure) => structure.structureId === sourceLink.source.structureId,
    );
    if (structure?.stage !== QUALIFYING) continue;

    const structureCompleted = isCompletedStructure({ structureId: sourceLink.source.structureId, drawDefinition });
    if (requireCompletedStructures && !structureCompleted) continue;

    const qualifyingRoundNumber = structure.qualifyingRoundNumber;
    const { matchUps } = getAllStructureMatchUps({
      matchUpFilters: {
        ...(qualifyingRoundNumber && { roundNumbers: [qualifyingRoundNumber] }),
        isCollectionMatchUp: false,
        hasWinningSide: true,
      },
      afterRecoveryTimes: false,
      inContext: true,
      structure,
    });

    for (const matchUp of matchUps) {
      const relevantSide =
        matchUp.matchUpStatus === BYE ? matchUp.sides?.find(({ participantId }) => participantId) : undefined;
      const winningSide = matchUp.sides?.find((side) => side?.sideNumber === matchUp.winningSide);

      if (winningSide || relevantSide) {
        const { participantId } = winningSide ?? relevantSide ?? {};
        // once each: a participant who won several matchUps of the source is one qualifier, not several
        if (
          participantId &&
          !assignedParticipantIds.includes(participantId) &&
          !qualifyingParticipantIds.includes(participantId)
        ) {
          qualifyingParticipantIds.push(participantId);
        }
      }
    }
  }
}

function collectRoundRobinQualifiers({
  roundRobinSourceLinks,
  assignedParticipantIds,
  qualifyingParticipantIds,
  drawDefinition,
}) {
  for (const sourceLink of roundRobinSourceLinks) {
    const structure = drawDefinition?.structures?.find(
      (structure) => structure.structureId === sourceLink.source.structureId,
    );
    if (structure?.stage !== QUALIFYING) continue;

    const structureCompleted = isCompletedStructure({
      structureId: sourceLink.source.structureId,
      drawDefinition,
    });
    if (!structureCompleted) continue;

    // the link names the group finishing positions that qualify (`[1]`: every group's winner; `[1, 2]`: the top two),
    // whether it is labelled POSITION or WINNER; a link naming none qualifies the winners
    const finishingPositions: number[] = sourceLink.source.finishingPositions?.length
      ? sourceLink.source.finishingPositions
      : [1];
    const { positionAssignments } = getPositionAssignments({ structure });
    const relevantParticipantIds =
      positionAssignments
        ?.map((assignment) => {
          const participantId = assignment.participantId;
          const results = firstClassOrExtension({ element: assignment, attribute: 'tally', name: TALLY });
          return results ? { participantId, groupOrder: results?.groupOrder } : {};
        })
        .filter(
          ({ groupOrder, participantId }) =>
            finishingPositions.includes(groupOrder) &&
            !assignedParticipantIds.includes(participantId) &&
            !qualifyingParticipantIds.includes(participantId),
        )
        .map(({ participantId }) => participantId) ?? [];

    if (relevantParticipantIds) qualifyingParticipantIds.push(...relevantParticipantIds);
  }
}
