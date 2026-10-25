import type { ParticipantReachability } from '../scheduleMatchUps/getParticipantReachability';
import type { PlanningView } from './view';

/**
 * The planning view as JSON, and back: the CONTRACT of what the profile planner decides from. A plan made from a view
 * equals the plan made from the same view written here and read back, so a view can be attached to a bug report, planned
 * from a literal, or used as a conformance case's input.
 *
 * What is written is only what the planner reads:
 *
 * - the members of `PlanningView` (`PLANNING_VIEW_KEYS`, which the compiler holds to the type, each required or optional);
 * - of each hydrated matchUp, court and date court, the fields in `MATCHUP_FIELDS`, `COURT_FIELDS` and
 *   `DATE_COURT_FIELDS`. A hydrated matchUp carries far more (names, round context, full participants), none of it
 *   read. The lists are what the planner's code reads, confirmed by recording every field it touched on every profile
 *   call of the corpus, the scale matrix and the scheduling tests. The round trip (`plan(view) ===
 *   plan(decode(encode(view)))`) checks them on those calls, but a field only some rule reads (a person request
 *   against a side's participant) is checked only where a call exercises that rule: `viewCodec.test.ts` pins it.
 *
 * The one member JSON cannot carry as is, `reachability.upstream` (a Set per matchUp, read on the day-load hot path), is
 * written as a sorted array and read back as a Set.
 */
// a member absent when the tournament has none of it (no daily limits, no overrides, no person requests) is OPTIONAL:
// JSON carries an absent member by leaving it out
const PLANNING_VIEW_KEYS: Record<keyof PlanningView, 'required' | 'optional'> = {
  matchUpDependencies: 'required',
  dailyLimitOverrides: 'optional',
  matchUpDailyLimits: 'optional',
  playedOrderFacts: 'required',
  personRequests: 'optional',
  eventTimings: 'required',
  timedMinutes: 'required',
  reachability: 'required',
  dateCourts: 'required',
  hydrated: 'required',
  courts: 'required',
  dates: 'required',
};

/** the planning view's members a conformance case's input must carry */
export const requiredPlanningViewKeys = () =>
  Object.entries(PLANNING_VIEW_KEYS).flatMap(([key, kind]) => (kind === 'required' ? [key] : []));

/** a field list: `true` keeps a value whole, an object keeps the listed fields of an object (or of each array element) */
type Fields = { [key: string]: true | Fields };

const PERSON: Fields = { personId: true };
const PARTICIPANT: Fields = {
  individualParticipantIds: true,
  individualParticipants: { participantId: true, person: PERSON },
  participantId: true,
  person: PERSON,
};
const MATCHUP_FIELDS: Fields = {
  matchUpId: true,
  tournamentId: true,
  eventId: true,
  drawId: true,
  structureId: true,
  roundNumber: true,
  matchUpType: true,
  matchUpStatus: true,
  matchUpFormat: true,
  winningSide: true,
  drawPositions: true,
  winnerMatchUpId: true,
  loserMatchUpId: true,
  winnerTo: { matchUpId: true },
  loserTo: { matchUpId: true },
  sidesTo: { matchUpId: true },
  schedule: {
    scheduledDate: true,
    scheduledTime: true,
    timeAfterRecovery: true,
    endTime: true,
    courtId: true,
    venueId: true,
  },
  score: {
    sets: {
      side1Score: true,
      side2Score: true,
      side1TiebreakScore: true,
      side2TiebreakScore: true,
      side1PointScore: true,
      side2PointScore: true,
    },
  },
  sides: { participantId: true, participant: PARTICIPANT },
  potentialParticipants: PARTICIPANT,
};
const COURT_FIELDS: Fields = { courtId: true, venueId: true };
const DATE_COURT_FIELDS: Fields = {
  courtId: true,
  courtName: true,
  venueId: true,
  dateAvailability: { date: true, startTime: true, endTime: true, bookings: true },
};

function pick(value: unknown, fields: Fields): unknown {
  if (Array.isArray(value)) return value.map((element) => pick(element, fields));
  if (!value || typeof value !== 'object') return value;
  const source = value as Record<string, unknown>;
  const picked: Record<string, unknown> = {};
  for (const [key, keep] of Object.entries(fields)) {
    if (source[key] === undefined) continue;
    picked[key] = keep === true ? source[key] : pick(source[key], keep);
  }
  return picked;
}

type EncodedReachability = Omit<ParticipantReachability, 'upstream'> & { upstream: { [matchUpId: string]: string[] } };

/** the planning view as plain data: what JSON carries, and what a conformance case holds as its input */
export function planningViewData(view: PlanningView): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const key of Object.keys(PLANNING_VIEW_KEYS) as (keyof PlanningView)[]) data[key] = view[key];
  const upstream = Object.fromEntries(
    Object.entries(view.reachability.upstream).map(([matchUpId, ids]) => [
      matchUpId,
      [...ids].sort((a, b) => a.localeCompare(b, 'en')),
    ]),
  );
  data.reachability = { ...view.reachability, upstream } satisfies EncodedReachability;
  data.hydrated = pick(view.hydrated, MATCHUP_FIELDS);
  data.courts = pick(view.courts, COURT_FIELDS);
  data.dateCourts = Object.fromEntries(
    Object.entries(view.dateCourts).map(([scheduleDate, courts]) => [scheduleDate, pick(courts, DATE_COURT_FIELDS)]),
  );
  return data;
}

/** a planning view from plain data (`planningViewData`), as the planner reads it */
export function planningViewFromData(data: Record<string, unknown>): PlanningView {
  const reachability = data.reachability as EncodedReachability;
  const upstream = Object.fromEntries(
    Object.entries(reachability.upstream).map(([matchUpId, ids]) => [matchUpId, new Set(ids)]),
  );
  return { ...data, reachability: { ...reachability, upstream } } as PlanningView;
}

export function encodePlanningView(view: PlanningView): string {
  return JSON.stringify(planningViewData(view));
}

export function decodePlanningView(text: string): PlanningView {
  return planningViewFromData(JSON.parse(text));
}
