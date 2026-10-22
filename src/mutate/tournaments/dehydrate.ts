import { MatchUp, Structure, TeamCompetitor, TieFormat, Tournament } from '@Types/tournamentTypes';
import { matchUpsOf, positionAssignmentsOf, structuresOf } from '@Acquire/structureMembers';
import { HydratedMatchUp, HydratedSide } from '@Types/hydrated';

// constants
import { ErrorType, INVALID_VALUES, MISSING_TOURNAMENT_RECORD } from '@Constants/errorConditionConstants';
import { SUCCESS } from '@Constants/resultConstants';

/**
 * Dehydration returns matchUps to their STORED shape.
 *
 * Queries hydrate: they copy event, draw and structure context onto each matchUp, resolve every side's participant
 * (and in a TEAM event the side's team), and give a collection matchUp the drawPositions and round of its tie. A
 * record assembled from query output — the public `getEventData` payload is one — carries all of it, and in a TEAM
 * event it carries it once per collection matchUp per side. Dehydration removes exactly what hydration adds:
 *
 * - keys a stored matchUp never has are dropped;
 * - keys that a stored matchUp MAY have, but that hydration also writes (`roundName`, `endDate`), are dropped only
 *   from a matchUp marked `hasContext`, so a stored value is never lost;
 * - a side's participant is dropped only where the record can derive it again: from the structure's
 *   positionAssignments for a matchUp with drawPositions, or from the tie's lineUp for a collection matchUp.
 *   Where it cannot be derived, the side keeps its participantId.
 *
 * It recurses into tieMatchUps, is idempotent, and leaves a record that is already stored-shape unchanged
 * (src/tests/mutations/matchUps/dehydrationHarness.test.ts holds it to all three).
 */

// Every attribute of a stored MatchUp (types/tournamentTypes.ts). Anything else on a matchUp is hydration.
const STORED_MATCHUP_KEYS = new Set([
  'checkIns',
  'collectionId',
  'collectionPosition',
  'createdAt',
  'delegatedOutcome',
  'disableAutoCalc',
  'drawPositions',
  'endDate',
  'extensions',
  'finishingPositionRange',
  'finishingRound',
  'indoorOutdoor',
  'isMock',
  'loserMatchUpId',
  'matchUpDuration',
  'matchUpFormat',
  'matchUpId',
  'matchUpStatus',
  'matchUpStatusCode',
  'matchUpStatusCodes',
  'matchUpType',
  'notes',
  'onlineResources',
  'orderOfFinish',
  'processCodes',
  'roundName',
  'roundNumber',
  'roundPosition',
  'schedule',
  'score',
  'sideExitProvenance',
  'sideStatusCodes',
  'sides',
  'startDate',
  'surfaceCategory',
  'tieFormat',
  'tieFormatId',
  'tieMatchUps',
  'timeItems',
  'updatedAt',
  'winnerMatchUpId',
  'winningSide',
]);

// Stored attributes that hydration also writes; dropped only from a matchUp that says it is hydrated.
const HYDRATED_VALUE_KEYS = ['roundName', 'endDate'];

// The attributes a stored (native) schedule holds — what migrateTournamentRecord promotes out of timeItems, plus
// what scoring and calling stamp. Hydration adds names, timing estimates and recovery times to these.
const STORED_SCHEDULE_KEYS = new Set([
  'allocatedCourts',
  'calledAt',
  'courtAnnotation',
  'courtId',
  'courtOrder',
  'homeParticipantId',
  'lock',
  'official',
  'scheduledDate',
  'scheduledTime',
  'scorekeeper',
  'scoredTime',
  'timekeeper',
  'timeModifiers',
  'venueId',
]);

// A collection matchUp takes these from its tie; on a collection matchUp they are always hydration.
const TIE_DERIVED_KEYS = [
  'drawPositions',
  'finishingPositionRange',
  'finishingRound',
  'loserMatchUpId',
  'roundNumber',
  'roundPosition',
  'winnerMatchUpId',
];

// Every attribute of a stored Side, plus the two a stored TEAM tie side carries for its draw position.
const STORED_SIDE_KEYS = new Set([
  'createdAt',
  'displaySideNumber',
  'drawPosition',
  'extensions',
  'isMock',
  'lineUp',
  'notes',
  'participantId',
  'sideNumber',
  'timeItems',
  'updatedAt',
]);

// Every attribute of a stored TeamCompetitor (a lineUp entry).
const STORED_COMPETITOR_KEYS = new Set([
  'collectionAssignments',
  'createdAt',
  'extensions',
  'isMock',
  'notes',
  'participantId',
  'timeItems',
  'updatedAt',
]);

type DehydrateContext = {
  /** drawPosition → participantId, from the structure the matchUp is stored in */
  assignedParticipantIds?: Record<number, string | undefined>;
  /** the structure the matchUp is stored in: a hydrated side's BYE or participant is moved into its positionAssignments */
  structure?: Structure;
  inheritedMatchUpFormat?: string;
  inheritedMatchUpType?: string;
  inheritedTieFormat?: TieFormat;
  /** treat the matchUp as hydrated even without a `hasContext` marker */
  hydrated?: boolean;
  /** the tie a collection matchUp belongs to */
  tieMatchUp?: MatchUp;
};

type DehydrateMatchUpsArgs = {
  tournamentRecord?: Tournament;
  /** treat every matchUp as hydrated: for a record assembled from query output that no longer marks `hasContext` */
  hydrated?: boolean;
};

export function dehydrateMatchUps({ tournamentRecord, hydrated }: DehydrateMatchUpsArgs): {
  success?: boolean;
  error?: ErrorType;
} {
  if (!tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };
  if (typeof tournamentRecord !== 'object' || !tournamentRecord.tournamentId) return { error: INVALID_VALUES };

  dehydrateRecordMatchUps(tournamentRecord, hydrated);
  return { ...SUCCESS };
}

/** The record walk behind `dehydrateMatchUps`, without its validation: for a record still being assembled. */
export function dehydrateRecordMatchUps(tournamentRecord: Tournament, hydrated?: boolean) {
  for (const event of tournamentRecord.events ?? []) {
    for (const drawDefinition of event.drawDefinitions ?? []) {
      const inherited = {
        matchUpFormat: drawDefinition.matchUpFormat || event.matchUpFormat,
        matchUpType: drawDefinition.matchUpType || event.eventType,
        tieFormat: drawDefinition.tieFormat ?? event.tieFormat,
      };
      for (const structure of drawDefinition.structures ?? []) dehydrateStructure(structure, inherited, hydrated);
    }
  }
}

type Inherited = { matchUpFormat?: string; matchUpType?: string; tieFormat?: TieFormat };

function dehydrateStructure(structure: Structure, inherited: Inherited, hydrated?: boolean) {
  const inheritedMatchUpFormat = structure.matchUpFormat || inherited.matchUpFormat;
  const inheritedMatchUpType = structure.matchUpType || inherited.matchUpType;
  const inheritedTieFormat = structure.tieFormat ?? inherited.tieFormat;
  const assignedParticipantIds = Object.fromEntries(
    (positionAssignmentsOf(structure) ?? []).map(({ drawPosition, participantId }) => [drawPosition, participantId]),
  );
  for (const matchUp of matchUpsOf(structure) ?? []) {
    dehydrateMatchUp(matchUp, {
      assignedParticipantIds,
      inheritedMatchUpFormat,
      inheritedMatchUpType,
      inheritedTieFormat,
      structure,
      hydrated,
    });
  }
  const childInherited = {
    matchUpFormat: inheritedMatchUpFormat,
    matchUpType: inheritedMatchUpType,
    tieFormat: inheritedTieFormat,
  };
  for (const child of structuresOf(structure) ?? []) dehydrateStructure(child, childInherited, hydrated);
}

/** Dehydrate one matchUp in place (its tieMatchUps included). Takes a stored or a hydrated matchUp. */
export function dehydrateMatchUp(storedOrHydrated: MatchUp, context: DehydrateContext = {}) {
  if (!storedOrHydrated || typeof storedOrHydrated !== 'object') return storedOrHydrated;
  const matchUp = storedOrHydrated as HydratedMatchUp;
  const { tieMatchUp } = context;
  const hydrated = context.hydrated || !!matchUp.hasContext;

  for (const key of Object.keys(matchUp)) {
    if (!STORED_MATCHUP_KEYS.has(key)) delete matchUp[key];
  }
  if (tieMatchUp) for (const key of TIE_DERIVED_KEYS) delete matchUp[key];
  if (hydrated) dropHydratedValues(matchUp, context);

  if (Array.isArray(matchUp.sides)) dehydrateSides(matchUp, { ...context, hydrated });

  const tieFormat = matchUp.tieFormat ?? context.inheritedTieFormat;
  for (const collectionMatchUp of matchUp.tieMatchUps ?? []) {
    const collectionDefinition = tieFormat?.collectionDefinitions?.find(
      ({ collectionId }) => collectionId === collectionMatchUp.collectionId,
    );
    dehydrateMatchUp(collectionMatchUp, {
      inheritedMatchUpFormat: collectionDefinition?.matchUpFormat,
      tieMatchUp: matchUp,
      hydrated,
    });
  }

  return matchUp;
}

// Values hydration writes onto every matchUp but a stored matchUp carries only where it differs from what it inherits.
function dropHydratedValues(matchUp: HydratedMatchUp, context: DehydrateContext) {
  const { inheritedMatchUpFormat, inheritedMatchUpType, inheritedTieFormat, tieMatchUp } = context;
  for (const key of HYDRATED_VALUE_KEYS) delete matchUp[key];
  if (inheritedMatchUpFormat && matchUp.matchUpFormat === inheritedMatchUpFormat) delete matchUp.matchUpFormat;
  if (inheritedTieFormat && matchUp.tieFormat && sameValue(matchUp.tieFormat, inheritedTieFormat)) {
    delete matchUp.tieFormat;
  }
  if (matchUp.schedule && typeof matchUp.schedule === 'object') {
    const schedule = pick(matchUp.schedule, STORED_SCHEDULE_KEYS);
    for (const key of Object.keys(schedule))
      if (schedule[key] === undefined || schedule[key] === null) delete schedule[key];
    if (Object.keys(schedule).length) matchUp.schedule = schedule;
    else delete matchUp.schedule;
  }
  // a TEAM tie and its collection matchUps store their matchUpType; an individual draw's matchUps inherit it
  const isTie = Array.isArray(matchUp.tieMatchUps);
  if (!isTie && !tieMatchUp && inheritedMatchUpType && matchUp.matchUpType === inheritedMatchUpType) {
    delete matchUp.matchUpType;
  }
}

// What a hydrated side holds for an unplayed position: numbering and nothing else.
const SIDE_NUMBERING_KEYS = new Set(['sideNumber', 'drawPosition', 'displaySideNumber']);
const isPlaceholderSide = (side: HydratedSide) =>
  Object.keys(side).every((key) => SIDE_NUMBERING_KEYS.has(key) || (key === 'lineUp' && !side.lineUp?.length));

function dehydrateSides(matchUp: HydratedMatchUp, context: DehydrateContext) {
  const { assignedParticipantIds, tieMatchUp } = context;
  const isTie = Array.isArray(matchUp.tieMatchUps);
  const sides = matchUp.sides ?? [];
  if (context.hydrated && !tieMatchUp) homeSidePositions(matchUp, context);

  // An individual matchUp in a draw takes its sides entirely from positionAssignments, when they hold them.
  if (!isTie && !tieMatchUp && matchUp.drawPositions) {
    const derivable = sides.every((side) => sideIsDerivable(side, matchUp, assignedParticipantIds));
    if (derivable) {
      delete matchUp.sides;
      return;
    }
  }

  matchUp.sides = sides.map((side) => {
    const stored = pick(side, STORED_SIDE_KEYS);
    if (Array.isArray(stored.lineUp)) {
      stored.lineUp = stored.lineUp.map((competitor) => pick(competitor, STORED_COMPETITOR_KEYS) as TeamCompetitor);
    }
    if (tieMatchUp) {
      // a collection matchUp's side is positioned by its tie: the tie side carries drawPosition
      delete stored.drawPosition;
      delete stored.displaySideNumber;
      if (lineUpAssigns(tieMatchUp, matchUp, side.sideNumber)) delete stored.participantId;
    } else if (
      side.participantId &&
      assignedParticipant(assignedParticipantIds, side.drawPosition) === side.participantId
    ) {
      delete stored.participantId;
    }
    return stored;
  });

  // hydration gives every matchUp two sides, positioned or not; a stored matchUp or tie has none until it is
  // positioned. A collection matchUp is the exception: it stores its two numbered sides from the start.
  if (context.hydrated && !tieMatchUp && matchUp.sides.every(isPlaceholderSide)) delete matchUp.sides;
}

/**
 * A hydrated side can be the only place a draw position is recorded: a record assembled from query output (as
 * buildFromSources assembles one) may hold no positionAssignment for a BYE, measured 2026-10-22 on all 4,008 BYE
 * sides of 759 ingested records. Before the side is dropped, its fact is moved where a stored record keeps it — a
 * position with NO assignment gains `{ drawPosition, bye: true }` or `{ drawPosition, participantId }`. A position
 * that has an assignment is never touched.
 */
function homeSidePositions(matchUp: HydratedMatchUp, { structure, assignedParticipantIds }: DehydrateContext) {
  if (!structure || !assignedParticipantIds) return;
  const assigned = new Set((positionAssignmentsOf(structure) ?? []).map(({ drawPosition }) => drawPosition));
  for (const side of matchUp.sides ?? []) {
    const { drawPosition, participantId, bye } = side ?? {};
    if (drawPosition === undefined || assigned.has(drawPosition)) continue;
    let assignment: { drawPosition: number; bye?: boolean; participantId?: string } | undefined;
    if (bye) assignment = { drawPosition, bye: true };
    else if (participantId) assignment = { drawPosition, participantId };
    if (!assignment) continue;
    // only an item structure holds matchUps, so only an item reaches here; push, or attach the first assignment
    const assignments = positionAssignmentsOf(structure);
    if (assignments) assignments.push(assignment);
    else Object.assign(structure, { positionAssignments: [assignment] });
    assignedParticipantIds[drawPosition] = assignment.participantId;
    assigned.add(drawPosition);
  }
}

// Membership, not an index: a lone drawPosition is stored at [0] whatever its side (LEADING_HOLE_REMOVAL_DESIGN.md),
// so asking whether the participant holds ANY of the matchUp's positions answers the same for both shapes.
function sideIsDerivable(
  side: HydratedSide,
  matchUp: HydratedMatchUp,
  assignedParticipantIds?: Record<number, string | undefined>,
) {
  if (!side?.participantId) return true;
  const positions: number[] = side.drawPosition === undefined ? (matchUp.drawPositions ?? []) : [side.drawPosition];
  return positions.some((position) => assignedParticipant(assignedParticipantIds, position) === side.participantId);
}

function assignedParticipant(assignedParticipantIds?: Record<number, string | undefined>, drawPosition?: number) {
  if (!assignedParticipantIds || drawPosition === undefined) return undefined;
  return assignedParticipantIds[drawPosition];
}

// Does the tie's lineUp for this side place anyone in this collection matchUp's position?
function lineUpAssigns(tieMatchUp: MatchUp, collectionMatchUp: MatchUp, sideNumber?: number) {
  const tieSide = tieMatchUp.sides?.find((s) => s.sideNumber === sideNumber);
  const { collectionId, collectionPosition } = collectionMatchUp;
  return (tieSide?.lineUp ?? []).some((competitor) =>
    (competitor.collectionAssignments ?? []).some(
      (a) => a.collectionId === collectionId && a.collectionPosition === collectionPosition,
    ),
  );
}

// key order is not meaning: a tieFormat copied onto a matchUp by hydration may list its keys differently
function sortedKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortedKeys);
  if (!value || typeof value !== 'object') return value;
  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(record)
      .sort((a, b) => a.localeCompare(b))
      .map((key) => [key, sortedKeys(record[key])]),
  );
}

function sameValue(a: unknown, b: unknown) {
  return JSON.stringify(sortedKeys(a)) === JSON.stringify(sortedKeys(b));
}

function pick<T extends object>(source: T | undefined, keys: Set<string>): Partial<T> {
  const out: Partial<T> = {};
  for (const key of Object.keys(source ?? {}) as (keyof T)[]) if (keys.has(String(key))) out[key] = source?.[key];
  return out;
}

export function getMatchUpFormatMap({ tournamentRecord }: { tournamentRecord: Tournament }) {
  const matchUpFormatMap: Record<string, string> = {};

  for (const event of tournamentRecord.events ?? []) {
    if (event.matchUpFormat) matchUpFormatMap[event.eventId] = event.matchUpFormat;

    for (const drawDefinition of event.drawDefinitions ?? []) {
      if (drawDefinition.matchUpFormat) matchUpFormatMap[drawDefinition.drawId] = drawDefinition.matchUpFormat;

      for (const structure of drawDefinition.structures ?? []) {
        if (structure.matchUpFormat) matchUpFormatMap[structure.structureId] = structure.matchUpFormat;
        for (const childStructure of structuresOf(structure) ?? []) {
          if (childStructure.matchUpFormat) matchUpFormatMap[childStructure.structureId] = childStructure.matchUpFormat;
        }
      }
    }
  }

  return matchUpFormatMap;
}

/**
 * Dehydrate a flat list of HYDRATED matchUps (each carrying its structureId/drawId/eventId), outside a record.
 * Without the record there are no positionAssignments to derive a side from, so a side is dropped only when it
 * carries no participantId; prefer `dehydrateMatchUps({ tournamentRecord })`.
 */
export function removeExtraneousAttributes(
  matchUps: (MatchUp & { structureId?: string; drawId?: string; eventId?: string })[],
  matchUpFormatMap: Record<string, string> = {},
) {
  for (const matchUp of matchUps) {
    const { structureId, drawId, eventId } = matchUp;
    const inheritedMatchUpFormat = [structureId, drawId, eventId]
      .map((id) => (id ? matchUpFormatMap[id] : undefined))
      .find(Boolean);
    dehydrateMatchUp(matchUp, { inheritedMatchUpFormat, hydrated: true });
  }
}
