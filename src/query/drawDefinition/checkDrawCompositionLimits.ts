import { getDrawCompositionConstraints } from './getDrawCompositionConstraints';
import { checkSanctionedEntryLimits } from './checkSanctionedEntryLimits';
import { getPositionAssignments } from './positionsGetter';
import { getQualifiersCount } from './getQualifiersCount';
import { isAdHocType } from './isAdHocType';

// constants and types
import { NO_STAGE_SPACE_AVAILABLE_FOR_ENTRY_STATUS } from '@Constants/errorConditionConstants';
import { QUALIFIER, STRUCTURE_SELECTED_STATUSES } from '@Constants/entryStatusConstants';
import type { DrawCompositionConstraints } from './getDrawCompositionConstraints';
import type { DrawDefinition, Event, Tournament } from '@Types/tournamentTypes';
import { MAIN } from '@Constants/drawDefinitionConstants';
import type { ResultType } from '@Types/factoryTypes';

/** Checks the actual generated geometry and entries before a draw is returned or attached. */
export function checkDrawCompositionLimits({
  tournamentRecord,
  event,
  drawDefinition,
  constraintOverrides,
}: {
  tournamentRecord?: Tournament;
  event?: Event;
  drawDefinition: DrawDefinition;
  constraintOverrides?: DrawCompositionConstraints;
}): ResultType {
  const { constraints, error } = getDrawCompositionConstraints({ tournamentRecord, event, constraintOverrides });
  if (error) return { error };
  if (!constraints) return {};
  const entryResult = checkSanctionedEntryLimits({
    tournamentRecord,
    event,
    entries: drawDefinition.entries,
    constraintOverrides,
  });
  if (entryResult.error) return entryResult;
  if (constraints.drawSize === undefined && constraints.maxQualifiers === undefined) return {};
  const primary = (drawDefinition.structures ?? []).filter(
    (structure) => structure.stage === MAIN && (structure.stageSequence ?? 1) === 1,
  );
  const assignments = primary.flatMap((structure) => getPositionAssignments({ structure }).positionAssignments);
  // AD_HOC has a roster rather than fixed positions; its accepted MAIN roster still obeys the sanction.
  const rosterCount = isAdHocType(drawDefinition.drawType)
    ? new Set(
        (drawDefinition.entries ?? [])
          .filter(
            (entry) =>
              (entry.entryStage ?? MAIN) === MAIN &&
              !!entry.entryStatus &&
              STRUCTURE_SELECTED_STATUSES.includes(entry.entryStatus),
          )
          .map((entry) => entry.participantId),
      ).size
    : 0;
  const linkedQualifiers =
    constraints.maxQualifiers === undefined
      ? 0
      : primary.reduce(
          (total, structure) =>
            total + (getQualifiersCount({ drawDefinition, structureId: structure.structureId }).qualifiersCount ?? 0),
          0,
        );
  const qualifierEntries = (drawDefinition.entries ?? []).filter(
    (entry) => (entry.entryStage ?? MAIN) === MAIN && entry.entryStatus === QUALIFIER,
  ).length;
  const qualifierPlaces = Math.max(
    linkedQualifiers,
    assignments.filter((assignment) => assignment.qualifier).length,
    qualifierEntries,
  );
  for (const [key, count] of [
    ['drawSize', Math.max(assignments.length, rosterCount)],
    ['maxQualifiers', qualifierPlaces],
  ] as const) {
    const limit = constraints[key];
    if (limit !== undefined && count > limit)
      return {
        error: NO_STAGE_SPACE_AVAILABLE_FOR_ENTRY_STATUS,
        context: { limit, count, limitName: key, stage: MAIN },
      };
  }
  return {};
}
