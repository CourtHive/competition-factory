import { drawPlayedOrderFacts, orderingNeighbours, placementOf } from '@Query/matchUps/scheduling/scheduleOrder';
import { checkRequiredParameters } from '@Helpers/parameters/checkRequiredParameters';
import { getMatchUpDependencies } from '@Query/matchUps/getMatchUpDependencies';
import { recordedTimes } from '@Query/matchUps/scheduling/recordedOrder';
import { allDrawMatchUps } from '@Query/matchUps/getAllDrawMatchUps';
import { extractDate, extractTime } from '@Tools/dateTime';

// constants and types
import { DrawDefinition, MatchUp, Tournament } from '@Types/tournamentTypes';
import { MATCHUP_NOT_FOUND } from '@Constants/errorConditionConstants';
import { DRAW_DEFINITION } from '@Constants/attributeConstants';
import { ResultType } from '@Types/factoryTypes';

/** a wall-clock time on a date; `inclusive` when the time itself is allowed */
export type ScheduleBound = { date: string; time: string; inclusive: boolean };

export type MatchUpScheduleBoundsMatchUp = {
  relation: 'source' | 'dependent';
  scheduledDate?: string;
  scheduledTime?: string;
  startTime?: string;
  roundNumber?: number;
  endTime?: string;
  /** the calendar day of `endTime`: the scheduled date, or the next for a match that ran past midnight */
  endDate?: string;
  matchUpId: string;
};

export type MatchUpScheduleBounds = {
  /** the first date the matchUp may be scheduled on: the tournament's start, or its latest dated source's date */
  earliestDate?: string;
  /** the last date it may be scheduled on: the tournament's end, or its earliest dated dependent's date */
  latestDate?: string;
  /** on `earliestDate`, a scheduled time must come after this one (a timed source on that date) */
  scheduledAfter?: ScheduleBound;
  /** on `latestDate`, a scheduled time must come before this one (a timed dependent on that date) */
  scheduledBefore?: ScheduleBound;
  /** a recorded start or end must come at or after this one: its sources' recorded times */
  recordedAfter?: ScheduleBound;
  /** a recorded start or end must come at or before this one: its dependents' recorded times */
  recordedBefore?: ScheduleBound;
  /** the matchUps that set the bounds */
  orderedBy: MatchUpScheduleBoundsMatchUp[];
};

type GetMatchUpScheduleBoundsArgs = {
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  /** false: only a played matchUp orders, as the schedule writes' `plannedOrder: false` (default true) */
  plannedOrder?: boolean;
  matchUpId: string;
};

/**
 * Where a matchUp may be scheduled, and when its recorded times may fall, without breaking the order of the matchUps
 * linked to it (CA 2026-10-30). A client limits its date and time pickers to these; the schedule writes refuse what
 * falls outside them with `ANACHRONISM`. The bounds read the same neighbours the writes judge (`orderingNeighbours`)
 * and follow the same comparison: a date on `earliestDate` or `latestDate` without a time proves nothing, and is
 * allowed.
 */
export function getMatchUpScheduleBounds(
  params: GetMatchUpScheduleBoundsArgs,
): ResultType & { bounds?: MatchUpScheduleBounds } {
  const paramsCheck = checkRequiredParameters(params, [{ [DRAW_DEFINITION]: true, matchUpId: true }]);
  if (paramsCheck.error) return paramsCheck;
  const { tournamentRecord, drawDefinition, matchUpId, plannedOrder = true } = params;

  const facts = drawPlayedOrderFacts(drawDefinition, { batched: true }) ?? {};
  if (!facts[matchUpId]) return { error: MATCHUP_NOT_FOUND };

  const { matchUpDependencies, matchUps = [] } = getMatchUpDependencies({ drawDefinition });
  const inContext = new Map(matchUps.map((matchUp) => [matchUp.matchUpId, matchUp]));
  const { sources, dependents } = orderingNeighbours({
    matchUpDependencies,
    plannedOrder,
    matchUpId,
    inContext,
    facts,
  });

  const raw = new Map<string, MatchUp>(
    (allDrawMatchUps({ drawDefinition, inContext: false }).matchUps ?? []).map((matchUp) => [
      matchUp.matchUpId,
      matchUp,
    ]),
  );
  const describe = (id: string, relation: MatchUpScheduleBoundsMatchUp['relation']): MatchUpScheduleBoundsMatchUp => {
    const matchUp = raw.get(id);
    const { startTime, endTime, endDate } = matchUp
      ? recordedTimes(matchUp)
      : { startTime: undefined, endTime: undefined, endDate: undefined };
    return {
      ...placementOf(facts[id] ?? {}),
      roundNumber: facts[id]?.roundNumber,
      ...(startTime ? { startTime } : {}),
      ...(endTime ? { endTime, endDate } : {}),
      matchUpId: id,
      relation,
    };
  };
  const orderedBy = [
    ...sources.map((id) => describe(id, 'source')),
    ...dependents.map((id) => describe(id, 'dependent')),
  ];

  const bounds: MatchUpScheduleBounds = {
    ...dateBounds({ tournamentRecord, orderedBy }),
    ...recordedBounds(orderedBy),
    orderedBy,
  };
  return { success: true, bounds };
}

const later = (a?: string, b?: string) => (!a || (b && b > a) ? b : a);
const earlier = (a?: string, b?: string) => (!a || (b && b < a) ? b : a);

function dateBounds({
  tournamentRecord,
  orderedBy,
}: {
  tournamentRecord?: Tournament;
  orderedBy: MatchUpScheduleBoundsMatchUp[];
}): Pick<MatchUpScheduleBounds, 'earliestDate' | 'latestDate' | 'scheduledAfter' | 'scheduledBefore'> {
  const dated = (relation: MatchUpScheduleBoundsMatchUp['relation']) =>
    orderedBy.filter((matchUp) => matchUp.relation === relation && matchUp.scheduledDate);
  const sources = dated('source');
  const dependents = dated('dependent');

  const latestSourceDate = sources.map(({ scheduledDate }) => scheduledDate).reduce(later, undefined);
  const earliestDependentDate = dependents.map(({ scheduledDate }) => scheduledDate).reduce(earlier, undefined);
  const earliestDate = later(extractDate(tournamentRecord?.startDate) || undefined, latestSourceDate);
  const latestDate = earlier(extractDate(tournamentRecord?.endDate) || undefined, earliestDependentDate);

  // a time on the boundary date is bounded by the timed neighbours on that same date; strictly, as the writes judge
  const sourceTime = sources
    .filter(({ scheduledDate, scheduledTime }) => scheduledDate === earliestDate && scheduledTime)
    .map(({ scheduledTime }) => scheduledTime)
    .reduce(later, undefined);
  const dependentTime = dependents
    .filter(({ scheduledDate, scheduledTime }) => scheduledDate === latestDate && scheduledTime)
    .map(({ scheduledTime }) => scheduledTime)
    .reduce(earlier, undefined);

  return {
    ...(earliestDate ? { earliestDate } : {}),
    ...(latestDate ? { latestDate } : {}),
    ...(earliestDate && sourceTime
      ? { scheduledAfter: { date: earliestDate, time: sourceTime, inclusive: false } }
      : {}),
    ...(latestDate && dependentTime
      ? { scheduledBefore: { date: latestDate, time: dependentTime, inclusive: false } }
      : {}),
  };
}

/** a recorded time as a bound on the day it fell (a full date-time value carries its own) */
const recordedBound = (date: string | undefined, time: string | undefined, inclusive: boolean) =>
  date && time ? { date: extractDate(time) || date, time: extractTime(time) || time, inclusive } : undefined;

const boundKey = (bound: ScheduleBound) => `${bound.date}T${bound.time}`;

function recordedBounds(
  orderedBy: MatchUpScheduleBoundsMatchUp[],
): Pick<MatchUpScheduleBounds, 'recordedAfter' | 'recordedBefore'> {
  // a source's end may be met (the next match may start the minute it ended); a start alone must be passed
  const after = orderedBy
    .filter(({ relation }) => relation === 'source')
    .map(({ scheduledDate, startTime, endTime, endDate }) =>
      endTime ? recordedBound(endDate, endTime, true) : recordedBound(scheduledDate, startTime, false),
    )
    .filter((bound): bound is ScheduleBound => !!bound)
    .reduce<ScheduleBound | undefined>(
      (latest, bound) => (!latest || boundKey(bound) > boundKey(latest) ? bound : latest),
      undefined,
    );
  // a dependent's start may be met by an end; its end alone must not be reached
  const before = orderedBy
    .filter(({ relation }) => relation === 'dependent')
    .map(({ scheduledDate, startTime, endTime, endDate }) =>
      startTime ? recordedBound(scheduledDate, startTime, true) : recordedBound(endDate, endTime, false),
    )
    .filter((bound): bound is ScheduleBound => !!bound)
    .reduce<ScheduleBound | undefined>(
      (earliest, bound) => (!earliest || boundKey(bound) < boundKey(earliest) ? bound : earliest),
      undefined,
    );
  return { ...(after ? { recordedAfter: after } : {}), ...(before ? { recordedBefore: before } : {}) };
}
