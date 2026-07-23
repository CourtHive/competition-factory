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
  match_up_status: string | null;
  winning_side: number | null;
  score_string: string | null; // winner-perspective
  tie_value: number | null;
  scheduled_date: string | null;
  published: boolean; // visibility, not omission
}

export interface ReadModelCompetitorRow {
  match_up_id: string;
  side_number: number | null; // 1 | 2
  competitor_index: number; // 0 (singles/team) | 0,1 (doubles)
  participant_type: string | null; // INDIVIDUAL | PAIR | TEAM
  side_participant_id: string | null;
  individual_participant_id: string | null;
  person_id: string | null; // canonical; NULL when synthetic/unresolved
  link_source: string; // providerId | unresolved
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
}

export interface ReadModelVenueRow {
  venue_id: string;
  venue_name: string | null;
  facility_id: string | null; // canonical facility; defaults to venue_id
  address: string | null;
}

export interface ReadModelTournamentVenueRow {
  tournament_id: string;
  venue_id: string;
}

/** The full read-model projection of one `tournamentRecord`. */
export interface ReadModelRows {
  tournaments: ReadModelTournamentRow[];
  match_ups: ReadModelMatchUpRow[];
  match_up_competitors: ReadModelCompetitorRow[];
  entries: ReadModelEntryRow[];
  venues: ReadModelVenueRow[];
  tournament_venues: ReadModelTournamentVenueRow[];
}
