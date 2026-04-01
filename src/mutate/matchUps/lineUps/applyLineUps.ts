import { checkRequiredParameters } from '@Helpers/parameters/checkRequiredParameters';
import { isMatchUpEventType } from '@Helpers/matchUpEventTypes/isMatchUpEventType';
import { resolveTieFormat } from '@Query/hierarchical/tieFormats/resolveTieFormat';
import { getPairedParticipant } from '@Query/participant/getPairedParticipant';
import { modifyMatchUpNotice } from '@Mutate/notifications/drawNotifications';
import { addParticipant } from '@Mutate/participants/addParticipant';
import { findDrawMatchUp } from '@Acquire/findDrawMatchUp';
import { instanceCount } from '@Tools/arrays';

// constants and types
import { ARRAY, DRAW_DEFINITION, MATCHUP_ID, OF_TYPE, TOURNAMENT_RECORD } from '@Constants/attributeConstants';
import { DrawDefinition, Event, TeamCompetitor, Tournament } from '@Types/tournamentTypes';
import { INDIVIDUAL, PAIR } from '@Constants/participantConstants';
import { DOUBLES, SINGLES, TEAM } from '@Constants/matchUpTypes';
import { COMPETITOR } from '@Constants/participantRoles';
import { SUCCESS } from '@Constants/resultConstants';
import {
  INVALID_MATCHUP,
  INVALID_PARTICIPANT_TYPE,
  INVALID_VALUES,
  MATCHUP_NOT_FOUND,
  MISSING_DRAW_POSITIONS,
  PARTICIPANT_NOT_FOUND,
  VALUE_UNCHANGED,
} from '@Constants/errorConditionConstants';

type ApplyLineUps = {
  tournamentRecord: Tournament;
  drawDefinition: DrawDefinition;
  lineUps: TeamCompetitor[];
  matchUpId: string;
  event: Event;
};

export function applyLineUps(params: ApplyLineUps) {
  const { tournamentRecord, drawDefinition, matchUpId, lineUps, event } = params;
  const stack = 'applyLineUps';

  const paramsCheck = checkRequiredParameters(
    params,
    [
      { [TOURNAMENT_RECORD]: true, [DRAW_DEFINITION]: true, [MATCHUP_ID]: true },
      { lineUps: true, [OF_TYPE]: ARRAY },
    ],
    stack,
  );
  if (paramsCheck.error) return paramsCheck;

  const tournamentParticipants = tournamentRecord.participants || [];
  let result = findDrawMatchUp({
    tournamentParticipants,
    inContext: true,
    drawDefinition,
    matchUpId,
  });
  if (result.error) return result;
  if (!result.matchUp) return { error: MATCHUP_NOT_FOUND };

  const { matchUp: inContextMatchUp, structure } = result;
  const { drawPositions, matchUpType } = inContextMatchUp;
  if (matchUpType !== TEAM) return { error: INVALID_MATCHUP };
  if (!drawPositions?.length) return { error: MISSING_DRAW_POSITIONS };

  const tieFormat = resolveTieFormat({
    matchUp: inContextMatchUp,
    drawDefinition,
    structure,
    event,
  })?.tieFormat;

  const sideAssignments: { [key: string]: any } = {};

  for (const lineUp of lineUps) {
    if (!Array.isArray(lineUp)) return { error: INVALID_VALUES, lineUp };

    const validationResult = validateLineUpAssignments({
      tournamentParticipants,
      inContextMatchUp,
      tieFormat,
      lineUp,
    });
    if (validationResult.error) return validationResult;

    const { collectionParticipantIds, sideNumbers } = validationResult;

    const pairResult = ensureDoublesPairParticipants({
      collectionParticipantIds,
      tournamentParticipants,
      tournamentRecord,
    });
    if (pairResult?.error) return pairResult;

    const sideNumber = determineSideNumber(sideNumbers);

    const sideAssignmentKeys = Object.keys(sideAssignments).map((key) => Number.parseInt(key));
    if (sideNumber && !sideAssignmentKeys.includes(sideNumber)) {
      sideAssignments[sideNumber] = lineUp;
    }
  }

  if (!Object.keys(sideAssignments).length) return { error: VALUE_UNCHANGED };

  result = findDrawMatchUp({ drawDefinition, matchUpId });
  if (result.error) return result;
  if (!result.matchUp) return { error: MATCHUP_NOT_FOUND };

  const { matchUp } = result;
  matchUp.sides ??= [];

  for (const sideNumber of [1, 2]) {
    const side = matchUp.sides.find((side) => side.sideNumber === sideNumber);
    const assignment = sideAssignments[sideNumber];
    if (!assignment) {
      continue;
    } else if (side) {
      side.lineUp = assignment;
    } else {
      matchUp.sides.push({ lineUp: assignment, sideNumber });
    }
  }

  modifyMatchUpNotice({
    tournamentId: tournamentRecord?.tournamentId,
    context: stack,
    drawDefinition,
    matchUp,
  });

  return { ...SUCCESS };
}

function validateLineUpAssignments({ tournamentParticipants, inContextMatchUp, tieFormat, lineUp }) {
  const collectionParticipantIds = {};
  const sideNumbers: number[] = [];

  for (const lineUpAssignment of lineUp) {
    if (typeof lineUpAssignment !== 'object') return { error: INVALID_VALUES, lineUpAssignment };

    const { participantId, collectionAssignments = [] } = lineUpAssignment;
    if (!Array.isArray(collectionAssignments)) return { error: INVALID_VALUES, collectionAssignments };

    const participant = tournamentParticipants.find((participant) => participant.participantId === participantId);
    if (!participant) return { error: PARTICIPANT_NOT_FOUND };
    if (participant.participantType !== INDIVIDUAL) return { error: INVALID_PARTICIPANT_TYPE };

    const sideNumber = inContextMatchUp.sides?.find((side: any) =>
      side.participant?.individualParticipantIds?.includes(participantId),
    )?.sideNumber;
    if (sideNumber) sideNumbers.push(sideNumber);

    for (const collectionAssignment of collectionAssignments) {
      if (typeof collectionAssignment !== 'object') return { error: INVALID_VALUES, collectionAssignment };

      const { collectionId, collectionPosition } = collectionAssignment;

      const collectionDefinition = tieFormat?.collectionDefinitions?.find(
        (collectionDefinition) => collectionDefinition.collectionId === collectionId,
      );
      if (!collectionDefinition) return { error: INVALID_VALUES, collectionId };

      const aggregator = `${collectionId}-${collectionPosition}`;
      if (!collectionParticipantIds[aggregator]) {
        collectionParticipantIds[aggregator] = [];
      }

      const participantsCount = collectionParticipantIds[aggregator].length;

      if (
        (isMatchUpEventType(SINGLES)(collectionDefinition.matchUpType) && participantsCount) ||
        (collectionDefinition.matchUpType === DOUBLES && participantsCount > 1)
      ) {
        return {
          info: 'Excessive collectionPosition assignments',
          error: INVALID_VALUES,
        };
      }

      collectionParticipantIds[aggregator].push(participantId);
    }
  }

  return { collectionParticipantIds, sideNumbers };
}

function ensureDoublesPairParticipants({ collectionParticipantIds, tournamentParticipants, tournamentRecord }) {
  const collectionParticipantIdPairs: string[][] = Object.values(collectionParticipantIds);
  for (const participantIds of collectionParticipantIdPairs) {
    if (participantIds.length === 2) {
      const { participant: pairedParticipant } = getPairedParticipant({
        tournamentParticipants,
        participantIds,
      });
      if (!pairedParticipant) {
        const newPairParticipant = {
          participantType: PAIR,
          participantRole: COMPETITOR,
          individualParticipantIds: participantIds,
        };
        const result = addParticipant({
          participant: newPairParticipant,
          pairOverride: true,
          tournamentRecord,
        });
        if (result.error) return result;
      }
    }
  }
}

function determineSideNumber(sideNumbers: number[]): number | undefined {
  const instances = instanceCount(sideNumbers);
  return (
    ((instances[1] || 0) > (instances[2] || 0) && 1) || ((instances[2] || 0) > (instances[1] || 0) && 2) || undefined
  );
}
