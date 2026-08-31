/**
 * Read-model row types — the flattened, query-optimized shape a `tournamentRecord`
 * is `cast()` into for the CQRS read-side (courthive-query `query_*` tables).
 *
 * Keys are snake_case and match the SQL columns in courthive-query
 * `001-read-model-tables.sql` exactly (the outbox / rebuild contract), and the
 * per-row deltas the CFS incremental producer emits. `cast()` is the single,
 * factory-pure source of this shape (plan: COURTHIVE_INGEST_SEPARATION_AND_PIPELINE §8).
 *
 * The container is keyed by LOGICAL table name (`match_ups`, not `query_match_ups`);
 * the consumer maps logical → physical `query_<name>`.
 */

export interface ReadModelTournamentRow {
  tournament_id: string;
  tournament_name: string | null;
  provider_id: string | null;
  start_date: string | null;
  end_date: string | null;
  city: string | null;
  published: boolean; // aggregate: order-of-play OR participants published
  // The system the RECORD was acquired from — the `tournamentOtherIds[]` entry flagged
  // `isOrigin`, flattened. `origin_tournament_id` is the ORIGIN organisation's id and is
  // deliberately independent of `tournament_id` above. Independent, too, of the events
  // table's origin columns: a record acquired wholesale from one organisation can carry
  // events sanctioned by others. Both null when no origin is declared.
  origin_organisation_id: string | null;
  origin_tournament_id: string | null;
}

/**
 * One row per tournament, denormalised for FACETED DISCOVERY — "what can I play, near me, that I
 * am eligible for".
 *
 * **The first aggregate row in the projection.** Every other `ReadModel*Row` is 1:1 with a source
 * object; this one summarises a tournament AND its events, because the questions it answers are
 * asked of the tournament while the answers live on the events. That is a deliberate denormalisation
 * and it is the reason the CONSUMER side needs an invalidation rule the other tables do not: an
 * event changing dirties its tournament's row.
 *
 * `cast()` is a pure whole-record projection, so it produces this correctly whether the consumer
 * maintains it incrementally or rebuilds it per tournament. That question is deliberately left open
 * here rather than prejudged.
 *
 * ## What is NOT here, and why
 *
 * **No `registration_state`.** "open" / "closing within a week" / "closed" is a function of NOW, and
 * `cast()` is pure — no I/O, no clock. Storing it would bake a timestamp into a row that nothing
 * re-runs on a schedule, so it would be wrong from the moment it was written. The dates are emitted
 * instead and the state is a READ-time derivation. This mirrors the call already made for
 * visibility, where `published` + `embargo` are stored and gated at read time "never a stale stored
 * boolean".
 *
 * ## Why `cast()` does not emit this yet
 *
 * Emitting it made SEVEN notice-conformance scenarios fail, and the failures are the finding rather
 * than an obstacle: `deleteEvents`, `addVenue`, `modifyVenue`, `setTournamentDates` (widen AND
 * shrink), `deleteVenue` and `setTournamentTier` each CHANGE a discovery row while emitting notices
 * scoped to an event or a venue — never to the tournament. The conformance harness therefore
 * measured the invalidation set for this row before anyone had to design it.
 *
 * That is the aggregate problem made concrete: the notice model attributes a projected row to the
 * entity that changed, and this row belongs to no single entity. Wiring it needs either
 * tournament-scoped notices on those six mutations or a consumer that rebuilds the row when any
 * member changes — a behaviour decision, not a projection detail, and one that belongs with the CFS
 * half of A9.
 *
 * The type and `tournamentDiscoveryRow()` ship now so the CFS and courthive-query work can be built
 * against a real shape instead of a proposed one.
 */
export interface ReadModelTournamentDiscoveryRow {
  tournament_id: string;
  provider_id: string | null;
  // dates are duplicated from `tournaments` deliberately: date range is the hottest facet, and a
  // discovery index that has to join to filter on it is not an index.
  start_date: string | null;
  end_date: string | null;
  // Geo, from the primary venue. `Address.latitude`/`longitude` are typed `string | number` in
  // CODES, so both are coerced to number here — a read model that stores two representations of a
  // coordinate cannot be indexed on it.
  latitude: number | null;
  longitude: number | null;
  venue_name: string | null;
  city: string | null;
  state: string | null;
  country_code: string | null;
  /**
   * ORGANISATIONAL SCOPE — how far the competition reaches: CLUB, DISTRICT, REGIONAL, NATIONAL,
   * INTERNATIONAL.
   *
   * A DIFFERENT question from `level_system`/`level_value` below, which carry the competitive GRADE
   * (`{system: 'USTA', value: 'Level 5 Open'}`). "Show me national events" and "show me Level 5
   * events" are separate facets, and a row that flattened both into one could answer neither
   * reliably. `#4710` makes the same distinction in the other direction, noting `AuthorityRoleEnum`
   * is "deliberately broader than TournamentLevelEnum (which is the ORGANISATIONAL SCOPE of a
   * competition)".
   */
  tournament_level: string | null;
  // Sanction, flattened. `level_*` comes from `sanction.classification`, falling back to
  // `tournamentTier` — the same tier shape, one grain up.
  level_system: string | null;
  level_value: string | null;
  recognition: string | null;
  decision: string | null;
  ranking_eligible: boolean | null;
  // Registration window as FACTS. See the note above on why no state is stored.
  entries_open: string | null;
  entries_close: string | null;
  /**
   * Fee range across the tournament's events.
   *
   * NULL — all four columns — when ANY contributing fee cannot be placed on a scale, or when fees
   * span more than one denomination. A partial range is a wrong answer wearing a number, and a
   * min/max computed across currencies compares figures that are not comparable.
   */
  fee_min: number | null;
  fee_max: number | null;
  fee_currency: string | null;
  fee_unit: string | null;
  // Facet aggregates over the events.
  event_count: number;
  category_types: string[];
  genders: string[];
  age_codes: string[];
  rating_types: string[];
  cancelled_at: string | null;
}

export interface ReadModelParticipantPublishRow {
  tournament_id: string;
  published: boolean;
  embargo: string | null;
}

export interface ReadModelMatchUpRow {
  match_up_id: string;
  tournament_id: string;
  provider_id: string | null;
  parent_match_up_id: string | null;
  collection_id: string | null;
  collection_position: number | null;
  match_up_level: string; // STANDARD | TIE | RUBBER
  draw_id: string | null;
  event_id: string | null;
  structure_id: string | null;
  venue_id: string | null;
  event_type: string | null; // SINGLES | DOUBLES | TEAM
  round_name: string | null;
  round_number: number | null;
  round_position: number | null; // position within the round (bracket coordinate)
  // draw-progression edges (stored on the drawDefinition matchUp, not derived)
  winner_match_up_id: string | null;
  loser_match_up_id: string | null;
  match_up_status: string | null;
  winning_side: number | null;
  score_string: string | null; // winner-perspective
  tie_value: number | null; // rubber weight from the tieFormat (RUBBER rows); NULL otherwise
  // Where a TIE's score comes from, when the tieFormat says so: REPORTED means the aggregate is
  // authoritative and the lines are unpopulated BY DESIGN, so a tie with no rubbers is COMPLETE, not
  // awaiting data entry. NULL = DERIVED (the default) and on every non-TIE row.
  score_source: string | null;
  match_up_format: string | null; // per-matchUp scoring-format override; NULL = draw/structure default
  scheduled_date: string | null;
  published: boolean; // publish INTENT (embargo-independent) — resolved through the structure/stage/draw cascade
  embargo: string | null; // effective embargo release (ISO), draw>stage>structure precedence; NULL when none
  schedule_embargo: string | null; // round-level (scheduledRounds) embargo release; gate venue_id/court_id on it at read time
}

export interface ReadModelCompetitorRow {
  match_up_id: string;
  // Denormalized from the parent matchUp. The competitors table's tournament linkage was
  // previously transitive ONLY (match_up_id → match_ups.tournament_id), which left the
  // incremental producer's participant-rename and person-claim UPDATEs keyed on a
  // participantId alone — table-wide, unscoped by tournament. Carrying the column makes
  // those statements scopable; `buildUpdate` cannot express a join.
  tournament_id: string;
  side_number: number | null; // 1 | 2
  competitor_index: number; // 0 (singles/team) | 0,1 (doubles)
  participant_type: string | null; // INDIVIDUAL | PAIR | TEAM
  side_participant_id: string | null;
  individual_participant_id: string | null;
  person_id: string | null; // canonical; NULL when synthetic/unresolved
  link_source: string; // providerId | unresolved
  /**
   * ⚠️ A DIFFERENT RULE FROM {@link ReadModelEntryRow.team_id}, and the two must not be assumed
   * interchangeable. This one is `participant.teamId ?? participantId`, so it falls back to a
   * TOURNAMENT-LOCAL id when a record states no durable team identity; the entry row's is the
   * ISSUED id from `participantOtherIds` and is `null` rather than local when none is stated.
   *
   * They coincide wherever a producer happens to set `participantId` to the issued id — which the
   * college-dual corpus does — and diverge everywhere else. Reconciling them is deliberately not
   * part of the entries work; treat this field as the pre-existing id space until it is.
   */
  team_id: string | null;
  provider_id: string | null;
  participant_name: string | null;
}

export interface ReadModelEntryRow {
  tournament_id: string;
  event_id: string | null;
  participant_id: string;
  person_id: string | null;
  provider_id: string | null;
  entry_status: string | null;
  /**
   * For a TEAM entry, the id an organisation ISSUED for that team — the durable identity, taken
   * from `participantOtherIds`. `null` for every other participantType, and for a TEAM stating no
   * issued id.
   *
   * NOT `participant_id`, which is tournament-local: keyed on that, a programme would look like a
   * different competitor in every record and its season would be exactly one fixture long. Also NOT
   * the rule `ReadModelCompetitorRow.team_id` uses (`participant.teamId ?? participantId`), which
   * falls back to that local id — see the note on {@link ReadModelCompetitorRow}.
   */
  team_id: string | null;
  /**
   * The organisation that issued `team_id`. A subjectId is unique only WITHIN its issuing body, so
   * a consumer indexing one body's ids must be able to say which body it means.
   */
  organisation_id: string | null;
}

export interface ReadModelEventRow {
  event_id: string;
  tournament_id: string;
  provider_id: string | null;
  event_name: string | null;
  event_type: string | null; // SINGLES | DOUBLES | TEAM | HYBRID
  gender: string | null;
  category_name: string | null;
  match_up_format: string | null;
  start_date: string | null;
  end_date: string | null;
  published: boolean;
  // The SANCTIONING SOURCE this event originated from — the `eventOtherIds[]` entry
  // flagged `isOrigin`, flattened. `origin_tournament_id` is the ORIGIN organisation's
  // tournamentId and is deliberately independent of `tournament_id` above (the record
  // that carries the event); one record can hold events from several sanctioning
  // systems. All three are null for an event with no declared origin.
  origin_organisation_id: string | null;
  origin_tournament_id: string | null;
  origin_event_id: string | null;
}

export interface ReadModelDrawRow {
  draw_id: string;
  tournament_id: string;
  event_id: string | null;
  provider_id: string | null;
  draw_name: string | null;
  draw_type: string | null;
  match_up_format: string | null;
  // The system this DRAW came from — the `drawOtherIds[]` entry flagged `isOrigin`,
  // flattened. Each column is independently nullable because an origin supplies only the
  // grains it models: a UTR flight yields origin_tournament_id (UTR's event id) +
  // origin_draw_id (the flight GUID) and leaves origin_event_id null, UTR having no
  // event-grain object at all.
  origin_organisation_id: string | null;
  origin_tournament_id: string | null;
  origin_event_id: string | null;
  origin_draw_id: string | null;
}

export interface ReadModelStructureRow {
  structure_id: string;
  draw_id: string;
  tournament_id: string;
  event_id: string | null;
  provider_id: string | null;
  structure_name: string | null;
  stage: string | null;
  stage_sequence: number | null;
  structure_type: string | null;
  structure_order: number | null;
  match_up_format: string | null;
  // the parent (CONTAINER) structure for a nested round-robin group; null for a
  // top-level structure. Lets a consumer relate a group ITEM to its container.
  parent_structure_id: string | null;
}

export interface ReadModelOrderOfPlayRow {
  tournament_id: string;
  published: boolean;
  scheduled_dates: string[] | null; // published dates; null = all
  event_ids: string[] | null; // published events; null = all
  embargo: string | null;
}

export interface ReadModelSchedulingProfileRow {
  tournament_id: string;
  schedule_date: string;
  venue_id: string;
  round_order: number; // position of the round within the venue's plan for the date
  event_id: string | null;
  draw_id: string | null;
  structure_id: string | null;
  round_number: number | null;
  // A round's segment is a PAIR — "segment 2 of 3" — so it needs two columns.
  // These were previously one `round_segment: number | null`, which was a lie: the
  // producer assigned the whole `{ segmentsCount, segmentNumber }` object to it,
  // unchecked because the source round is `any`. Postgres rejected every such row
  // against an `integer` column, and since the scheduling plan re-projects as
  // delete-then-insert, each segmented round was deleted and never restored.
  round_segment_number: number | null;
  round_segments_count: number | null;
  winner_finishing_position_range: string | null;
}

export interface ReadModelSeedRow {
  structure_id: string;
  seed_number: number;
  tournament_id: string;
  event_id: string | null;
  draw_id: string | null;
  seed_value: string | null; // display value; may be a range e.g. "3-4"
  participant_id: string;
  provider_id: string | null;
}

export interface ReadModelVenueRow {
  venue_id: string;
  venue_name: string | null;
  facility_id: string | null; // canonical facility; defaults to venue_id
  address: string | null;
}

export interface ReadModelCourtRow {
  court_id: string;
  venue_id: string;
  tournament_id: string;
  provider_id: string | null;
  court_name: string | null;
  indoor_outdoor: string | null;
  surface_category: string | null;
  surface_type: string | null;
  latitude: string | null;
  longitude: string | null;
}

export interface ReadModelTournamentVenueRow {
  tournament_id: string;
  venue_id: string;
}

/** The full read-model projection of one `tournamentRecord`. */
export interface ReadModelRows {
  tournaments: ReadModelTournamentRow[];
  events: ReadModelEventRow[];
  draws: ReadModelDrawRow[];
  structures: ReadModelStructureRow[];
  seeds: ReadModelSeedRow[];
  courts: ReadModelCourtRow[];
  order_of_play: ReadModelOrderOfPlayRow[];
  scheduling_profile: ReadModelSchedulingProfileRow[];
  participant_publish: ReadModelParticipantPublishRow[];
  match_ups: ReadModelMatchUpRow[];
  match_up_competitors: ReadModelCompetitorRow[];
  entries: ReadModelEntryRow[];
  venues: ReadModelVenueRow[];
  tournament_venues: ReadModelTournamentVenueRow[];
  /**
   * NOT YET EMITTED BY `cast()` — see {@link ReadModelTournamentDiscoveryRow}. Optional so the row
   * shape can be consumed and built against before the projection wiring exists.
   */
  tournament_discovery?: ReadModelTournamentDiscoveryRow[];
}
