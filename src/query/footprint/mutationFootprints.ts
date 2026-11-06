import { OUTCOME_PIPELINE_V2, OutcomePipelineMode } from '@Constants/outcomePipelineConstants';
import { ALTERNATE, WITHDRAWN } from '@Constants/entryStatusConstants';

/**
 * What part of a tournament record a mutation reads and may write: its FOOTPRINT. A storage layer that keeps a
 * record in parts (a shell, one row per drawDefinition, one row per participant) loads only these before running
 * the method, and writes back only these after.
 *
 * - `shell`             the tournament without its participants, its events without their drawDefinitions. Every
 *                       footprint holds it: policies, entries and extensions resolve from it, and the engine stamps
 *                       the record it modified.
 * - `draw`              the drawDefinitions named by `drawIds`.
 * - `drawParticipants`  the participants those draws reference, with their individuals and groupings
 *                       (`getReferencedParticipants`).
 * - `eventDraws`        every drawDefinition of the events named by `eventIds`.
 * - `participants`      every participant.
 * - `tournament`        the whole record.
 *
 * A footprint is a function of the method AND its params: `entryStatus`, `proConflictDetection`, and a `drawId`
 * versus an `eventId` move one method between draw, event and tournament scope. A method with no entry here is the
 * whole record, so the map grows one method at a time and an unknown method is never under-loaded: a missing entry
 * costs speed, never a wrong answer.
 *
 * Declared against the engine's code and checked by `src/tests/mutations/footprint/`, which runs each declared method
 * on a record reduced to its footprint and on the whole record and fails when they differ, or when the whole-record
 * run writes outside the footprint.
 */
export type FootprintShard = 'shell' | 'draw' | 'drawParticipants' | 'eventDraws' | 'participants' | 'tournament';

export type MethodFootprint = {
  shards: FootprintShard[];
  drawIds?: string[];
  eventIds?: string[];
};

export type FootprintContext = {
  // which outcome pipeline will run: v1 hydrates a TEAM collection line's sides against participants before scoring
  outcomePipeline?: OutcomePipelineMode;
};

type FootprintRule = (params: Record<string, any>, context: FootprintContext) => MethodFootprint;

const TOURNAMENT: MethodFootprint = { shards: ['tournament'] };

const ids = (one?: string, many?: string[]): string[] => [...(many ?? []), ...(one ? [one] : [])];

/** One draw, named by `drawId`. Without it the draw is found by walking every event, so the whole record is needed. */
const drawScoped =
  (extra: FootprintShard[] = []): FootprintRule =>
  (params) =>
    params?.drawId ? { shards: ['shell', 'draw', ...extra], drawIds: [params.drawId] } : TOURNAMENT;

// court-slot double booking is checked against every matchUp of the tournament
const scheduleRule: FootprintRule = (params, context) =>
  params?.proConflictDetection ? TOURNAMENT : drawScoped()(params, context);

const scoreRule: FootprintRule = (params, context) => {
  // a score that also schedules is checked as a schedule
  if (params?.schedule && params?.proConflictDetection) return TOURNAMENT;
  // v2 decides from what the draw stores; v1 (and `differential`, which runs v1 too) resolves a TEAM collection
  // line's sides against the tournament's participants, more than the draw's own slice
  const extra: FootprintShard[] = context.outcomePipeline === OUTCOME_PIPELINE_V2 ? [] : ['participants'];
  return drawScoped(extra)(params, context);
};

const removeAssignmentRule: FootprintRule = (params, context) => {
  // withdrawing or making an alternate rewrites the participant's entries across every draw of the event; a pair
  // destroyed on the way splits into its individuals
  if ([ALTERNATE, WITHDRAWN].includes(params?.entryStatus)) {
    if (!params?.drawId || !params?.eventId) return TOURNAMENT;
    return {
      shards: ['shell', 'draw', 'eventDraws', 'participants'],
      eventIds: [params.eventId],
      drawIds: [params.drawId],
    };
  }
  return drawScoped()(params, context);
};

const matchUpFormatRule: FootprintRule = (params) => {
  const drawIds = ids(params?.drawId, params?.drawIds);
  const eventIds = ids(params?.eventId, params?.eventIds);
  if (drawIds.length) return { shards: ['shell', 'draw'], drawIds };
  if (!eventIds.length) return TOURNAMENT; // every event of the tournament
  const structural =
    params?.force ||
    params?.scheduledDates ||
    params?.structureIds?.length ||
    params?.structureId ||
    Array.isArray(params?.stages) ||
    Array.isArray(params?.stageSequences);
  // unscoped, only `event.matchUpFormat` changes: the shell
  return structural ? { shards: ['shell', 'eventDraws'], eventIds } : { shards: ['shell'] };
};

export const mutationFootprints: Record<string, FootprintRule> = {
  // score entry
  setMatchUpStatus: scoreRule,

  // positions
  assignDrawPosition: drawScoped(),
  assignDrawPositionBye: drawScoped(),
  removeDrawPositionAssignment: removeAssignmentRule,

  // scheduling: the schedule lives on the matchUp; courts and venues resolve from the shell
  addMatchUpScheduleItems: scheduleRule,
  addMatchUpScheduledDate: drawScoped(),
  addMatchUpScheduledTime: drawScoped(),
  addMatchUpCourtOrder: drawScoped(),
  addMatchUpStartTime: drawScoped(),
  addMatchUpEndTime: drawScoped(),
  addMatchUpStopTime: drawScoped(),
  addMatchUpResumeTime: drawScoped(),
  assignMatchUpCourt: drawScoped(),
  assignMatchUpVenue: drawScoped(),

  // desk: the in-context matchUp hydrates its sides
  checkInParticipant: drawScoped(['drawParticipants']),
  checkOutParticipant: drawScoped(['drawParticipants']),

  setMatchUpFormat: matchUpFormatRule,
};

export function getMethodFootprint(
  method: string,
  params: Record<string, any> | undefined,
  context: FootprintContext = {},
): MethodFootprint {
  const rule = mutationFootprints[method];
  return rule ? rule(params ?? {}, context) : TOURNAMENT;
}
