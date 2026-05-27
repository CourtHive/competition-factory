/**
 * engine.q — unwrap query facade (CODES Phase 5.x developer-JOY prototype #2)
 *
 * Every factory query returns a result envelope like `{ events, error }` or
 * `{ event, drawDefinition, error }`. Consumers spend a lot of time writing
 * `tournamentEngine.getEvents()?.events ?? []` boilerplate to dig the
 * payload out.
 *
 * `engine.q` is a typed convenience layer that unwraps the primary payload
 * for ~30 of the most-used queries. Each method returns the unwrapped value
 * (or a sensible fallback if the underlying call errored or the key was
 * missing) — never the envelope.
 *
 * Example:
 *
 *   // before
 *   const events = tournamentEngine.getEvents()?.events ?? [];
 *   const event  = tournamentEngine.getEvent({ eventId })?.event;
 *
 *   // after
 *   const events = tournamentEngine.q.events();
 *   const event  = tournamentEngine.q.event({ eventId });
 *
 * The original methods stay intact — `q` is purely additive. Consumers can
 * opt in per-call-site without a breaking change.
 *
 * If a query returns multiple useful keys (e.g. `getEvent` returns `event`
 * and `drawDefinition`), the registry can expose multiple facade names that
 * call the same underlying method.
 */

type QueryRegistryEntry = {
  /** factory engine method name to invoke */
  method: string;
  /** key on the result envelope to unwrap */
  key: string;
  /** fallback when the call errors or the key is missing */
  fallback?: any;
};

/**
 * Registry of facade name → underlying engine call. Curated from the top ~30
 * queries by usage frequency across the CourtHive ecosystem consumers
 * (TMX in particular). Extend over time; the cost of adding a new entry is
 * one row in this map plus one signature on `QueryFacade`.
 */
const QUERY_REGISTRY: Record<string, QueryRegistryEntry> = {
  // tournament-level
  tournament: { method: 'getTournament', key: 'tournamentRecord' },
  tournamentInfo: { method: 'getTournamentInfo', key: 'tournamentInfo' },
  tournamentTimeItem: { method: 'getTournamentTimeItem', key: 'timeItem' },
  linkedTournamentIds: { method: 'getLinkedTournamentIds', key: 'linkedTournamentIds' },
  policyDefinitions: { method: 'getPolicyDefinitions', key: 'policyDefinitions' },
  participants: { method: 'getParticipants', key: 'participants', fallback: [] },

  // event-level
  event: { method: 'getEvent', key: 'event' },
  events: { method: 'getEvents', key: 'events', fallback: [] },
  eventData: { method: 'getEventData', key: 'eventData' },
  eventRankingPoints: { method: 'getEventRankingPoints', key: 'eventRankingPoints' },
  flightProfile: { method: 'getFlightProfile', key: 'flightProfile' },

  // draw-level
  drawDefinition: { method: 'findDrawDefinition', key: 'drawDefinition' },
  draftState: { method: 'getDraftState', key: 'draftState' },
  publishState: { method: 'getPublishState', key: 'publishState' },
  availablePlayoffProfiles: { method: 'getAvailablePlayoffProfiles', key: 'availablePlayoffProfiles', fallback: [] },
  validGroupSizes: { method: 'getValidGroupSizes', key: 'validGroupSizes', fallback: [] },
  assignedParticipantIds: { method: 'getAssignedParticipantIds', key: 'assignedParticipantIds', fallback: [] },
  swissChart: { method: 'getSwissChart', key: 'swissChart' },
  structureSeedAssignments: { method: 'getStructureSeedAssignments', key: 'seedAssignments', fallback: [] },
  positionAssignments: { method: 'getPositionAssignments', key: 'positionAssignments', fallback: [] },

  // matchUps
  matchUp: { method: 'findMatchUp', key: 'matchUp' },
  matchUps: { method: 'allTournamentMatchUps', key: 'matchUps', fallback: [] },
  drawMatchUps: { method: 'allDrawMatchUps', key: 'matchUps', fallback: [] },
  eventMatchUps: { method: 'allEventMatchUps', key: 'matchUps', fallback: [] },
  competitionMatchUps: { method: 'getCompetitionMatchUps', key: 'matchUps', fallback: [] },
  matchUpsMap: { method: 'getMatchUpsMap', key: 'matchUpsMap' },

  // venues / courts
  venue: { method: 'findVenue', key: 'venue' },
  venuesAndCourts: { method: 'getVenuesAndCourts', key: 'venues', fallback: [] },

  // PositionAssignment-level reads
  tally: { method: 'getTally', key: 'tally' },

  // extension passthrough (mode-agnostic via the underlying findExtension)
  extension: { method: 'findExtension', key: 'extension' },

  // CompetitionEngine surface — these only resolve when the underlying
  // engine actually carries the method; otherwise the facade returns the
  // fallback (undefined or []) and no crash.
  competitionVenues: { method: 'getCompetitionVenues', key: 'venues', fallback: [] },
  competitionParticipants: { method: 'getCompetitionParticipants', key: 'participants', fallback: [] },
};

/**
 * Typed facade surface. Hand-maintained to give consumers IDE-discoverable
 * methods with real return types. Per-method arg shapes are still `any`
 * because the underlying engine methods are `any`-typed — tightening that
 * is the natural follow-up (the joy-research "#1 typed signatures" item).
 *
 * IMPORTANT: Each method here MUST have a matching entry in QUERY_REGISTRY
 * with the same key. The unit tests assert this invariant.
 */
export interface QueryFacade {
  // tournament-level
  tournament(args?: any): any;
  tournamentInfo(args?: any): any;
  tournamentTimeItem(args?: any): any;
  linkedTournamentIds(args?: any): string[] | undefined;
  policyDefinitions(args?: any): any;
  participants(args?: any): any[];

  // event-level
  event(args?: any): any;
  events(args?: any): any[];
  eventData(args?: any): any;
  eventRankingPoints(args?: any): any;
  flightProfile(args?: any): any;

  // draw-level
  drawDefinition(args?: any): any;
  draftState(args?: any): any;
  publishState(args?: any): any;
  availablePlayoffProfiles(args?: any): any[];
  validGroupSizes(args?: any): any[];
  assignedParticipantIds(args?: any): string[];
  swissChart(args?: any): any;
  structureSeedAssignments(args?: any): any[];
  positionAssignments(args?: any): any[];

  // matchUps
  matchUp(args?: any): any;
  matchUps(args?: any): any[];
  drawMatchUps(args?: any): any[];
  eventMatchUps(args?: any): any[];
  competitionMatchUps(args?: any): any[];
  matchUpsMap(args?: any): any;

  // venues / courts
  venue(args?: any): any;
  venuesAndCourts(args?: any): any[];

  // PositionAssignment-level
  tally(args?: any): any;

  // extension passthrough
  extension(args?: any): any;

  // competition engine surface
  competitionVenues(args?: any): any[];
  competitionParticipants(args?: any): any[];
}

/**
 * Build the facade against an engine instance. Engine methods that are not
 * present on the engine (e.g. CompetitionEngine-only methods on a tournament
 * engine) silently fall back — no crash.
 */
export function buildQueryFacade(engine: any): QueryFacade {
  const facade: any = {};
  for (const [facadeName, entry] of Object.entries(QUERY_REGISTRY)) {
    facade[facadeName] = (args?: any) => {
      const fn = engine?.[entry.method];
      if (typeof fn !== 'function') return entry.fallback;
      const result = fn(args);
      if (!result || result.error !== undefined) return entry.fallback;
      const value = result[entry.key];
      return value !== undefined ? value : entry.fallback;
    };
  }
  return facade as QueryFacade;
}

/**
 * Map of facade name → registry entry. Exported for tests + future
 * documentation tooling.
 */
export const queryRegistry: Readonly<Record<string, QueryRegistryEntry>> = QUERY_REGISTRY;
