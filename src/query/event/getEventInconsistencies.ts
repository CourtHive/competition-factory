import { finalize, hasErrorSeverity, Inconsistency } from '@Query/integrity/inconsistency';
import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import { positionAssignmentsOf, structuresOf } from '@Acquire/structureMembers';
import { expectedParticipantType } from '@Query/event/participantTypeForEvent';
import { getParticipants } from '@Query/participants/getParticipants';
import { extractDate } from '@Tools/dateTime';

// constants and types
import { MatchUpsMap, ParticipantMap, ResultType } from '@Types/factoryTypes';
import { Event, Structure, Tournament } from '@Types/tournamentTypes';
import { MISSING_EVENT } from '@Constants/errorConditionConstants';
import { INDIVIDUAL, PAIR } from '@Constants/participantConstants';
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

// EVENT_DATES_OUTSIDE_TOURNAMENT: the event's startDate or endDate lies outside the tournament's
// range. `disjoint` is true when no day of the event range is inside the tournament range; a
// scheduler then ignores the event range and falls back to the tournament's, and this finding is
// how that fallback is flagged. setTournamentDates no longer produces such a range, so it marks a
// record written before that rule or edited outside the engine. (warning)
export const EVENT_DATES_OUTSIDE_TOURNAMENT = 'EVENT_DATES_OUTSIDE_TOURNAMENT';

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
    if (structuresOf(structure)?.length) collectStructures(structuresOf(structure), collected);
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
      (positionAssignmentsOf(structure) ?? [])
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

function getEventDateRangeIssues(event: Event, tournamentRecord?: Tournament): any[] {
  const day = (date?: string) => (date ? extractDate(date) : undefined);
  const tournamentStartDate = day(tournamentRecord?.startDate);
  const tournamentEndDate = day(tournamentRecord?.endDate);
  const startDate = day(event.startDate);
  const endDate = day(event.endDate);
  const before = (date?: string) => !!date && !!tournamentStartDate && date < tournamentStartDate;
  const after = (date?: string) => !!date && !!tournamentEndDate && date > tournamentEndDate;
  if (!before(startDate) && !after(startDate) && !before(endDate) && !after(endDate)) return [];

  const disjoint = after(startDate) || before(endDate);
  return [
    {
      issueType: EVENT_DATES_OUTSIDE_TOURNAMENT,
      message: `event dates ${startDate ?? ''}..${endDate ?? ''} ${disjoint ? 'lie entirely' : 'extend'} outside tournament dates ${tournamentStartDate ?? ''}..${tournamentEndDate ?? ''}`,
      severity: 'warning',
      tournamentStartDate,
      tournamentEndDate,
      startDate,
      endDate,
      disjoint,
    },
  ];
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

  const dateRangeIssues = getEventDateRangeIssues(event, tournamentRecord);

  const combined = [...drawInconsistencies, ...typeMismatches, ...dateRangeIssues];
  const finalized = finalize(combined, { scope: 'EVENT', eventId });
  return { ...SUCCESS, valid: !hasErrorSeverity(finalized), inconsistencies: finalized };
}
