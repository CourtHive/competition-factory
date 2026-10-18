import { addMatchUpScheduleItems } from '@Mutate/matchUps/schedule/scheduleItems/scheduleItems';
import { proConflicts } from '@Mutate/matchUps/schedule/schedulers/proScheduler/proConflicts';
import { checkInParticipant } from '@Mutate/timeItems/matchUps/checkInParticipant';
import { allCompetitionMatchUps } from '@Query/matchUps/getAllCompetitionMatchUps';
import { setMatchUpCalledAt } from '@Mutate/matchUps/schedule/setMatchUpCalledAt';
import { allTournamentMatchUps } from '@Query/matchUps/getAllTournamentMatchUps';

// constants and types
import { ErrorType, INVALID_VALUES } from '@Constants/errorConditionConstants';
import type { DrawDefinition, Tournament } from '@Types/tournamentTypes';
import type { HydratedMatchUp } from '@Types/hydrated';
import {
  CONFLICT_COURT_DOUBLE_BOOKING,
  CONFLICT_COURT_TIME_ORDER,
  CONFLICT_MATCHUP_ORDER,
} from '@Constants/scheduleConstants';

/**
 * Operational state and deliberate conflicts for a scenario (G3/G4 of the mocksEngine hardening plan).
 *
 * Expressed as INTENT, never as field writes: "the matchUps due in the next 15 minutes have been called",
 * "one court's times run against its order of play". Each is applied through the same mutation an operator's
 * client makes, so a fixture is indistinguishable from a director's record, and each conflict is the one the
 * factory's own detector (`proConflicts`) reports — the profile asks for the condition, not a hand-placed
 * row, so it keeps exercising the detector when the scheduler changes.
 */

export const SCENARIO_CONFLICT_TYPES = [
  CONFLICT_COURT_DOUBLE_BOOKING,
  CONFLICT_COURT_TIME_ORDER,
  CONFLICT_MATCHUP_ORDER,
] as const;
const SCENARIO_CONFLICT_TYPE_SET = new Set<string>(SCENARIO_CONFLICT_TYPES);

export type ScenarioConflict = { type: (typeof SCENARIO_CONFLICT_TYPES)[number] | string; count?: number };

type ScenarioStateArgs = {
  checkedIn?: { withinMinutes: number };
  called?: { withinMinutes: number };
  conflicts?: ScenarioConflict[];
  tournamentRecord: Tournament;
  assignCourts?: boolean;
  anchorDate: Date;
};

type Placed = { matchUp: HydratedMatchUp; instant: number };

const refuse = (info: string) => ({ error: INVALID_VALUES, info });

function invalidScenarioState({ called, checkedIn, conflicts, assignCourts }: ScenarioStateArgs) {
  for (const timeWindow of [called, checkedIn]) {
    if (timeWindow !== undefined && !(Number.isFinite(timeWindow?.withinMinutes) && timeWindow.withinMinutes >= 0))
      return refuse('called and checkedIn take { withinMinutes }, a non-negative number');
  }
  if (conflicts !== undefined && !Array.isArray(conflicts)) return refuse('conflicts is an array of { type, count }');
  if (conflicts?.length && !assignCourts) return refuse('conflicts are placed on courts: they need assignCourts');
  for (const conflict of conflicts ?? []) {
    if (!SCENARIO_CONFLICT_TYPE_SET.has(conflict?.type))
      return refuse(`conflict type must be one of ${SCENARIO_CONFLICT_TYPES.join(', ')}`);
    const count = conflict.count ?? 1;
    if (!Number.isInteger(count) || count < 1) return refuse('a conflict count is a whole number, at least 1');
  }
  return undefined;
}

export function applyScenarioState(params: ScenarioStateArgs) {
  const invalid = invalidScenarioState(params);
  if (invalid) return invalid;

  const { tournamentRecord, anchorDate, called, checkedIn, conflicts } = params;
  const drawMap: Record<string, DrawDefinition> = {};
  for (const event of tournamentRecord.events ?? []) {
    for (const drawDefinition of event.drawDefinitions ?? []) drawMap[drawDefinition.drawId] = drawDefinition;
  }

  const dueWithin = (minutes: number) =>
    placedMatchUps(tournamentRecord).filter(
      ({ matchUp, instant }) =>
        !matchUp.winningSide &&
        matchUp.sides?.every((side) => side.participantId) &&
        instant >= anchorDate.getTime() &&
        instant <= anchorDate.getTime() + minutes * 60_000,
    );

  const calledMatchUpIds: string[] = [];
  for (const { matchUp } of called ? dueWithin(called.withinMinutes) : []) {
    const result = setMatchUpCalledAt({
      drawDefinition: drawMap[matchUp.drawId],
      calledAt: anchorDate.toISOString(),
      matchUpId: matchUp.matchUpId,
      disableNotice: true,
      tournamentRecord,
    });
    if (result?.error) return result;
    calledMatchUpIds.push(matchUp.matchUpId);
  }

  const checkedInMatchUpIds: string[] = [];
  for (const { matchUp } of checkedIn ? dueWithin(checkedIn.withinMinutes) : []) {
    const result = checkInSides({ matchUp, drawDefinition: drawMap[matchUp.drawId], tournamentRecord, anchorDate });
    if (result?.error) return result;
    checkedInMatchUpIds.push(matchUp.matchUpId);
  }

  const placed = placeConflicts({ conflicts: conflicts ?? [], tournamentRecord, drawMap });
  if ('error' in placed) return placed;

  return { calledMatchUpIds, checkedInMatchUpIds, conflicts: placed.conflicts };
}

function placeConflicts({
  tournamentRecord,
  conflicts,
  drawMap,
}: {
  drawMap: Record<string, DrawDefinition>;
  tournamentRecord: Tournament;
  conflicts: ScenarioConflict[];
}) {
  const used = new Set<string>();
  const placed: { type: string; matchUpIds: string[] }[] = [];
  for (const conflict of conflicts) {
    for (let index = 0; index < (conflict.count ?? 1); index++) {
      const result = placeConflict({ type: conflict.type, tournamentRecord, drawMap, used });
      if (result.error) return result;
      placed.push(result.conflict);
    }
  }
  return { conflicts: placed };
}

function checkInSides({
  tournamentRecord,
  drawDefinition,
  anchorDate,
  matchUp,
}: {
  drawDefinition: DrawDefinition;
  tournamentRecord: Tournament;
  matchUp: HydratedMatchUp;
  anchorDate: Date;
}) {
  // the subject of a check-in is an individual: a pair's members, or the singles participant
  const individualIds = (matchUp.sides ?? []).flatMap(
    (side) => side.participant?.individualParticipantIds ?? [side.participantId],
  );
  for (const participantId of individualIds.filter((id): id is string => !!id)) {
    const result = checkInParticipant({
      occurredAt: anchorDate.toISOString(),
      matchUpId: matchUp.matchUpId,
      tournamentRecord,
      drawDefinition,
      participantId,
    });
    if (result?.error) return result;
  }
  return undefined;
}

// a detector error is returned, not read as "no issues": a conflict placed on a matchUp that already has one could
// be masked by it, and the fixture would report a conflict proConflicts never shows
function issuedMatchUpIds(tournamentRecord: Tournament): Set<string> | { error: ErrorType; info?: string } {
  const tournamentRecords = { [tournamentRecord.tournamentId]: tournamentRecord };
  const matchUps = (
    allCompetitionMatchUps({ tournamentRecords, nextMatchUps: true, inContext: true }).matchUps ?? []
  ).filter((matchUp) => matchUp.schedule?.courtOrder);
  if (!matchUps.length) return new Set();
  const result = proConflicts({ tournamentRecords, matchUps });
  if ('error' in result) return { error: result.error, info: result.info };
  return new Set(
    Object.values(result.rowIssues)
      .flat()
      .map((issue: { matchUpId: string }) => issue.matchUpId),
  );
}

/** Scheduled matchUps with a court and an instant, in a stable order: date, court, order of play. */
function placedMatchUps(tournamentRecord: Tournament): Placed[] {
  return (allTournamentMatchUps({ tournamentRecord, inContext: true }).matchUps ?? [])
    .map((matchUp) => ({ matchUp, instant: instantOf(matchUp) }))
    .filter((placed): placed is Placed => placed.instant !== undefined)
    .sort(
      (a, b) =>
        String(a.matchUp.schedule?.courtId ?? '').localeCompare(String(b.matchUp.schedule?.courtId ?? '')) ||
        (a.matchUp.schedule?.courtOrder ?? 0) - (b.matchUp.schedule?.courtOrder ?? 0) ||
        a.instant - b.instant,
    );
}

function instantOf(matchUp: HydratedMatchUp): number | undefined {
  const { scheduledDate, scheduledTime } = matchUp.schedule ?? {};
  if (!scheduledDate || !scheduledTime) return undefined;
  const time = String(scheduledTime).includes('T') ? String(scheduledTime).split('T')[1] : String(scheduledTime);
  const instant = new Date(`${String(scheduledDate).split('T')[0]}T${time.slice(0, 5)}`).getTime();
  return Number.isNaN(instant) ? undefined : instant;
}

type PlaceConflictArgs = {
  drawMap: Record<string, DrawDefinition>;
  tournamentRecord: Tournament;
  /** matchUps already in a placed conflict: a second one is not placed on top of them */
  used: Set<string>;
  type: string;
};

type PlacedConflict =
  { conflict: { type: string; matchUpIds: string[] }; error?: undefined } | { error: ErrorType; info?: string };

function placeConflict({ type, tournamentRecord, drawMap, used }: PlaceConflictArgs): PlacedConflict {
  // a matchUp the grid already gave an issue is passed over: proConflicts keeps only a matchUp's most severe
  // issue, so a conflict placed on it could be masked (measured: the anchored grid's own matchUp-order issues
  // hid a court-time-order warning)
  const issued = issuedMatchUpIds(tournamentRecord);
  if ('error' in issued) return issued;
  const placed = placedMatchUps(tournamentRecord).filter(
    ({ matchUp }) =>
      matchUp.schedule?.courtId &&
      matchUp.schedule?.courtOrder &&
      !used.has(matchUp.matchUpId) &&
      !issued.has(matchUp.matchUpId),
  );
  const write = (matchUp: HydratedMatchUp, schedule: Record<string, unknown>) =>
    addMatchUpScheduleItems({
      drawDefinition: drawMap[matchUp.drawId],
      matchUpId: matchUp.matchUpId,
      removePriorValues: true,
      disableNotice: true,
      tournamentRecord,
      schedule,
    });
  const done = (matchUpIds: string[]): PlacedConflict => {
    matchUpIds.forEach((matchUpId) => used.add(matchUpId));
    return { conflict: { type, matchUpIds } };
  };

  if (type === CONFLICT_COURT_TIME_ORDER) {
    // a later matchUp on a court moved to the time of the one before it: a later order of play no later in
    // the day. Earliest rounds first: proConflicts keeps only a matchUp's most severe issue, and a first-round
    // matchUp has no sources, so no dependency conflict can stand in front of this warning
    const pairs = placed
      .slice(1)
      .map((entry, index) => ({ earlier: placed[index].matchUp, later: entry.matchUp }))
      .filter(
        ({ earlier, later }) =>
          earlier.schedule?.courtId === later.schedule?.courtId &&
          earlier.schedule?.scheduledDate === later.schedule?.scheduledDate,
      )
      .sort((a, b) => (a.later.roundNumber ?? 0) - (b.later.roundNumber ?? 0));
    const [pair] = pairs;
    if (pair) {
      const result = write(pair.later, { scheduledTime: pair.earlier.schedule?.scheduledTime });
      if (result.error) return { error: result.error, info: result.info };
      return done([pair.later.matchUpId, pair.earlier.matchUpId]);
    }
  }

  if (type === CONFLICT_COURT_DOUBLE_BOOKING) {
    // a matchUp moved onto another's court and order of play, on the same day
    for (const { matchUp: target } of placed) {
      const mover = placed.find(
        ({ matchUp }) =>
          matchUp.schedule?.courtId !== target.schedule?.courtId &&
          matchUp.schedule?.scheduledDate === target.schedule?.scheduledDate,
      )?.matchUp;
      if (!mover) continue;
      const { courtId, courtOrder, scheduledDate } = target.schedule ?? {};
      const result = write(mover, { courtId, courtOrder, scheduledDate });
      if (result.error) return { error: result.error, info: result.info };
      return done([mover.matchUpId, target.matchUpId]);
    }
  }

  if (type === CONFLICT_MATCHUP_ORDER) {
    // a matchUp moved into the same order of play as a matchUp it depends on, so both cannot be played
    for (const { matchUp: source } of placed) {
      const dependent = placed.find(({ matchUp }) => matchUp.matchUpId === source.winnerMatchUpId)?.matchUp;
      if (!dependent || dependent.schedule?.scheduledDate !== source.schedule?.scheduledDate) continue;
      const result = write(dependent, { courtOrder: source.schedule?.courtOrder });
      if (result.error) return { error: result.error, info: result.info };
      return done([dependent.matchUpId, source.matchUpId]);
    }
  }

  return refuse(`no scheduled matchUps left to place a ${type} conflict on`);
}
