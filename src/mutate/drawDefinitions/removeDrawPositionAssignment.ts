import { conditionallyDisableLinkPositioning } from './positionGovernor/conditionallyDisableLinkPositioning';
import { assignDrawPositionBye } from '@Mutate/matchUps/drawPositions/assignDrawPositionBye';
import { addPositionActionTelemetry } from './positionGovernor/addPositionActionTelemetry';
import { clearDrawPosition } from '@Mutate/matchUps/drawPositions/positionClear';
import { findTournamentParticipant } from '@Acquire/findTournamentParticipant';
import { modifyEntriesStatus } from '@Mutate/entries/modifyEntriesStatus';
import { getAppliedPolicies } from '@Query/extensions/getAppliedPolicies';
import { destroyPairEntry } from '@Mutate/entries/destroyPairEntry';
import { decorateResult } from '@Functions/global/decorateResult';
import { findStructure } from '@Acquire/findStructure';

// constants and types
import { ALTERNATE, WITHDRAWN } from '@Constants/entryStatusConstants';
import { PAIR } from '@Constants/participantConstants';
import { ResultType } from '@Types/factoryTypes';

export function removeDrawPositionAssignment(params): ResultType & { participantId?: string } {
  const {
    tournamentRecord,
    preserveScheduling,
    replaceWithBye,
    drawDefinition,
    destroyPair,
    entryStatus,
    matchUpsMap,
    drawId,
  } = params;

  const stack = 'removeDrawPositionAssignment';

  const result = clearDrawPosition(params);
  if (result.error) return decorateResult({ result, stack });

  const { participantId } = result;
  const { drawPosition, event, structureId } = params;

  const appliedPolicies =
    getAppliedPolicies({
      tournamentRecord,
      drawDefinition,
      event,
    }).appliedPolicies ?? {};

  if ([ALTERNATE, WITHDRAWN].includes(entryStatus) && participantId) {
    const { tournamentRecord } = params;
    const { participant } = findTournamentParticipant({
      tournamentRecord,
      participantId,
    });
    const { participantType, individualParticipantIds } = participant ?? {};

    if (destroyPair && participantType === PAIR) {
      const result = destroyPairEntry({
        tournamentRecord,
        drawDefinition,
        participantId,
        event,
      });
      if (result.error) return decorateResult({ result, stack });
      if (individualParticipantIds)
        modifyEntriesStatus({
          participantIds: individualParticipantIds,
          tournamentRecord,
          drawDefinition,
          entryStatus,
          drawId,
          event,
        });
    } else {
      modifyEntriesStatus({
        participantIds: [participantId],
        tournamentRecord,
        drawDefinition,
        entryStatus,
        drawId,
        event,
      });
    }
  }

  if (replaceWithBye) {
    const result = assignDrawPositionBye({
      // Forwarded, not defaulted: `undefined` keeps the placement, matching the
      // BYE-assignment default. This path does not set `isPositionAction`, so the
      // ambiguity gate never fires here — removing a participant must not hard-fail
      // because the seat happened to be scheduled.
      preserveScheduling,
      tournamentRecord,
      drawDefinition,
      drawPosition,
      structureId,
      matchUpsMap,
      event,
    });
    if (result.error) return decorateResult({ result, stack });
  }

  const { structure } = findStructure({ drawDefinition, structureId });
  conditionallyDisableLinkPositioning({
    structure,
    drawPositions: [drawPosition],
  });
  const positionAction = {
    name: 'removeDrawPositionAssignment',
    replaceWithBye,
    drawPosition,
    entryStatus,
    structureId,
  };
  addPositionActionTelemetry({ appliedPolicies, drawDefinition, positionAction });

  return result;
}
