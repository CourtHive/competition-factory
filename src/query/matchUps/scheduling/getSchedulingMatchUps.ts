import { getMatchUpScheduleDetails } from '@Query/matchUp/getMatchUpScheduleDetails';
import { bucketStructureMatchUps } from '@Query/structure/getStructureMatchUps';
import { addUpcomingMatchUps } from '@Query/matchUp/addUpcomingMatchUps';
import { allDrawMatchUps } from '@Query/matchUps/getAllDrawMatchUps';
import { buildStructuralIndex } from '@Query/matchUps/structuralIndex';
import { getDrawStructures } from '@Acquire/findStructure';
import { structuresOf } from '@Acquire/structureMembers';

// types
import type { DrawDefinition, Event, Tournament } from '@Types/tournamentTypes';
import type { TournamentRecords } from '@Types/factoryTypes';
import type { HydratedMatchUp } from '@Types/hydrated';

/**
 * The matchUps as the schedulers read them, without hydrating the competition: what `allCompetitionMatchUps({
 * nextMatchUps: true })` returns of the fields a scheduler reads, and nothing else. Each draw's matchUps come from the
 * structural index (the stored matchUp, its structure's context and its sides), with
 *
 * - its tournament, event, stage and stage sequence;
 * - its schedule as hydration derives it (`getMatchUpScheduleDetails`), less the venue and court NAMES and the recovery
 *   times, which need the tournament's venues and policies;
 * - of each side's participant, its id and, for a pair, its individuals' ids;
 * - unless `nextMatchUps` is false, its winner and loser targets and its potential participants (`addUpcomingMatchUps`,
 *   the function hydration calls).
 *
 * A draw the index does not cover (TEAM) is hydrated alone. Pinned to the hydration, field by field, by
 * `schedulingMatchUps.test.ts`.
 */
export function getSchedulingMatchUps({
  nextMatchUps = true,
  tournamentRecords,
  matchUpTypes,
}: {
  /** false: no winner and loser targets or potential participants derived, as `allCompetitionMatchUps({ inContext: true })` */
  nextMatchUps?: boolean;
  tournamentRecords: TournamentRecords;
  /** only matchUps of these types are returned; every draw is still read, as its links cross types */
  matchUpTypes?: string[];
}): HydratedMatchUp[] {
  const matchUps: HydratedMatchUp[] = [];
  for (const tournamentRecord of Object.values(tournamentRecords)) {
    for (const event of tournamentRecord.events ?? []) {
      for (const drawDefinition of event.drawDefinitions ?? []) {
        matchUps.push(...drawSchedulingMatchUps({ tournamentRecord, drawDefinition, event, nextMatchUps }));
      }
    }
  }
  return matchUpTypes ? matchUps.filter(({ matchUpType }) => matchUpTypes.includes(matchUpType as string)) : matchUps;
}

type DrawArgs = { tournamentRecord: Tournament; drawDefinition: DrawDefinition; event: Event; nextMatchUps: boolean };

function drawSchedulingMatchUps({
  tournamentRecord,
  drawDefinition,
  event,
  nextMatchUps,
}: DrawArgs): HydratedMatchUp[] {
  const { tournamentId } = tournamentRecord;
  const { eventId } = event;
  const index = buildStructuralIndex({ tournamentRecord, drawDefinition, event });
  if (index.unsupported) {
    const hydrated =
      allDrawMatchUps({ tournamentRecord, drawDefinition, event, inContext: true, nextMatchUps }).matchUps ?? [];
    return hydrated.map((matchUp) => ({ ...matchUp, tournamentId, eventId }));
  }

  // a structure's stage and stage sequence, a round robin group's being its container's
  const stages = new Map<string, { stage?: string; stageSequence?: number }>();
  for (const structure of drawDefinition.structures ?? []) {
    const { stage, stageSequence } = structure;
    stages.set(structure.structureId, { stage, stageSequence });
    for (const group of structuresOf(structure) ?? []) stages.set(group.structureId, { stage, stageSequence });
  }
  // a pair's individuals, which a doubles side is read through
  const individuals = new Map<string, string[]>();
  for (const { participantId, individualParticipantIds } of tournamentRecord.participants ?? [])
    if (individualParticipantIds) individuals.set(participantId, individualParticipantIds);

  const matchUps = index.matchUps.map((entry) => {
    const { schedule } = getMatchUpScheduleDetails({ matchUp: entry });
    const sides = entry.sides?.map((side) => {
      const individualParticipantIds = side.participantId && individuals.get(side.participantId);
      return side.participant && individualParticipantIds
        ? { ...side, participant: { ...side.participant, individualParticipantIds } }
        : side;
    });
    return {
      ...stages.get(entry.structureId),
      ...entry,
      hasContext: true,
      tournamentId,
      schedule,
      eventId,
      sides,
    } as HydratedMatchUp;
  });
  // the potential participants a target collects follow the order its sources are read in: the hydration's
  if (nextMatchUps)
    addUpcomingMatchUps({ drawDefinition, inContextDrawMatchUps: inHydrationOrder(drawDefinition, matchUps) });
  return matchUps;
}

/**
 * A draw's matchUps in the order the hydration reads them (getAllDrawMatchUps): structure by structure, each
 * structure's sorted into its buckets (abandoned, completed, upcoming, pending, BYE; participants not required, as there),
 * then each bucket across the structures.
 */
function inHydrationOrder(drawDefinition: DrawDefinition, matchUps: HydratedMatchUp[]): HydratedMatchUp[] {
  const buckets: HydratedMatchUp[][] = [[], [], [], [], []];
  for (const structure of getDrawStructures({ drawDefinition }).structures ?? []) {
    const held = matchUps.filter(
      (matchUp) => (matchUp.containerStructureId ?? matchUp.structureId) === structure.structureId,
    );
    const { abandonedMatchUps, completedMatchUps, upcomingMatchUps, pendingMatchUps, byeMatchUps } =
      bucketStructureMatchUps({ matchUps: held, requireParticipants: false, structure });
    [abandonedMatchUps, completedMatchUps, upcomingMatchUps, pendingMatchUps, byeMatchUps].forEach((bucket, index) =>
      buckets[index].push(...bucket),
    );
  }
  return buckets.flat();
}
