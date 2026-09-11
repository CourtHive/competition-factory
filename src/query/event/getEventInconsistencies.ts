import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import { expectedParticipantType } from '@Query/event/participantTypeForEvent';
import { finalize, Inconsistency } from '@Query/integrity/inconsistency';
import { getParticipants } from '@Query/participants/getParticipants';

// constants and types
import { MatchUpsMap, ParticipantMap, ResultType } from '@Types/factoryTypes';
import { Event, Structure, Tournament } from '@Types/tournamentTypes';
import { INDIVIDUAL, PAIR } from '@Constants/participantConstants';
import { MISSING_EVENT } from '@Constants/errorConditionConstants';
import { HYBRID_EVENT } from '@Constants/eventConstants';
import { SUCCESS } from '@Constants/resultConstants';

// getEventInconsistencies is the EVENT layer of the integrity hierarchy. It fans out to
// getDrawInconsistencies for every drawDefinition (stamping eventId) and adds the check that is
// only visible at the event level: whether the participantTypes actually assigned in the event's
// draws are consistent with the event's eventType — a DOUBLES event whose draw carries INDIVIDUAL
// participants, a SINGLES event carrying PAIR participants, etc. HYBRID events legitimately carry
// both INDIVIDUAL and PAIR.
//
// The check reads STORED positionAssignments (not inContext sides) and resolves each assigned
// participant's type via the participantMap, so it works without loading the whole engine.
//
// DEFERRED — entries-vs-placed drift and gender/category eligibility are not implemented here.
// checkValidEntries already covers entry-level coherence (and couples in gender-enforcement policy);
// folding it into the integrity scan risks policy-dependent false positives and is a later sub-phase.
export const EVENT_PARTICIPANT_TYPE_MISMATCH = 'EVENT_PARTICIPANT_TYPE_MISMATCH';

type GetEventInconsistenciesArgs = {
  tournamentRecord?: Tournament;
  participantMap?: ParticipantMap;
  matchUpsMap?: MatchUpsMap;
  event: Event;
};

// Flatten the structure tree — round-robin CONTAINER nodes hold their groups in `structures[]`.
function collectStructures(structures: Structure[] | undefined, collected: Structure[]): void {
  for (const structure of structures ?? []) {
    collected.push(structure);
    if (structure.structures?.length) collectStructures(structure.structures, collected);
  }
}

function getParticipantTypeMismatches(params: GetEventInconsistenciesArgs, participantMap?: ParticipantMap): any[] {
  const { event } = params;
  if (!participantMap) return []; // cannot resolve participant types without a participantMap

  const { eventType } = event;
  const validTypes = new Set(eventType === HYBRID_EVENT ? [INDIVIDUAL, PAIR] : [expectedParticipantType(eventType)]);
  const expected = [...validTypes].join(' or ');

  const placements = (event.drawDefinitions ?? []).flatMap((drawDefinition) => {
    const structures: Structure[] = [];
    collectStructures(drawDefinition.structures, structures);
    return structures.flatMap((structure) =>
      (structure.positionAssignments ?? [])
        .filter((assignment) => assignment.participantId)
        .map((assignment) => ({
          drawId: drawDefinition.drawId,
          structureId: structure.structureId,
          participantId: assignment.participantId as string,
        })),
    );
  });

  const inconsistencies: any[] = [];
  for (const placement of placements) {
    const participantType = participantMap[placement.participantId]?.participant?.participantType;
    if (participantType && !validTypes.has(participantType)) {
      inconsistencies.push({
        issueType: EVENT_PARTICIPANT_TYPE_MISMATCH,
        message: `participant of type ${participantType} assigned in a ${eventType} event (expected ${expected})`,
        severity: 'error',
        drawId: placement.drawId,
        structureId: placement.structureId,
        participantId: placement.participantId,
        participantType,
      });
    }
  }
  return inconsistencies;
}

export function getEventInconsistencies(
  params: GetEventInconsistenciesArgs,
): ResultType & { valid?: boolean; inconsistencies?: Inconsistency[] } {
  const { event, tournamentRecord, matchUpsMap } = params;
  if (!event) return { error: MISSING_EVENT };
  const eventId = event.eventId;

  const drawInconsistencies = (event.drawDefinitions ?? []).flatMap(
    (drawDefinition) =>
      getDrawInconsistencies({ drawDefinition, tournamentRecord, matchUpsMap, event }).inconsistencies ?? [],
  );

  let participantMap = params.participantMap;
  if (!participantMap && tournamentRecord) ({ participantMap } = getParticipants({ tournamentRecord }));
  const typeMismatches = getParticipantTypeMismatches(params, participantMap);

  const combined = [...drawInconsistencies, ...typeMismatches];
  const finalized = finalize(combined, { scope: 'EVENT', eventId });
  return { ...SUCCESS, valid: finalized.length === 0, inconsistencies: finalized };
}
