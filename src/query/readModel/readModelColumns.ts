import type { ReadModelRows } from '@Types/readModelTypes';

/**
 * The read model's column list, as RUNTIME data.
 *
 * WHY THIS EXISTS. The row contract was exported as TypeScript types only — `ReadModelRows` and the
 * builder functions in `readModelRows.ts`. Types erase at compile time, so a consumer in another
 * repository had nothing to import and restated the column list by hand. `courthive-query`'s
 * `TABLE_META` is that restatement, and its `deltaApplier` writes ONLY the columns that list names:
 * anything else in a delta's `row_data` is filtered out silently, without an error, without a log
 * line, and without a NULL anyone could find suspicious.
 *
 * That is not hypothetical. Measured 2026-09-08, against a real Postgres carrying both services'
 * migration chains: `tournamentRow` emits `origin_organisation_id` / `origin_tournament_id` and
 * `drawRow` emits four `origin_*` columns, and every one of those six was being discarded on
 * arrival. `courthive-query`'s own `tableMeta.spec` could not see it — it checks `TABLE_META`
 * against that repository's migrations in both directions, and both sides agreed with each other
 * while disagreeing with the producer, which lives here.
 *
 * So the fix is not another test. It is to stop declaring the list twice: this manifest is the one
 * declaration, and `TABLE_META` consumes it.
 *
 * KEEPING IT HONEST. Two compiler checks, no runtime cost:
 *
 *   1. `satisfies Record<keyof ReadModelRows, readonly string[]>` — every table in `ReadModelRows`
 *      appears here exactly once, and nothing else does. Adding a table to the read model without
 *      adding it here is a type error.
 *   2. `ReadModelColumnAssertions` below — each table's list is EXACTLY the keys of its row
 *      interface, in both directions. A column added to a row type and not to this list is a type
 *      error, and so is the reverse.
 *
 * Both are structural: they key off `ReadModelRows`, which already maps table name to row type, so
 * there is no second mapping to drift.
 */
export const READ_MODEL_COLUMNS = {
  tournaments: [
    'tournament_id',
    'tournament_name',
    'provider_id',
    'start_date',
    'end_date',
    'city',
    'published',
    'origin_organisation_id',
    'origin_tournament_id',
  ],
  events: [
    'event_id',
    'tournament_id',
    'provider_id',
    'event_name',
    'event_type',
    'gender',
    'category_name',
    'match_up_format',
    'start_date',
    'end_date',
    'published',
    'origin_organisation_id',
    'origin_tournament_id',
    'origin_event_id',
  ],
  draws: [
    'draw_id',
    'tournament_id',
    'event_id',
    'provider_id',
    'draw_name',
    'draw_type',
    'match_up_format',
    'origin_organisation_id',
    'origin_tournament_id',
    'origin_event_id',
    'origin_draw_id',
  ],
  structures: [
    'structure_id',
    'draw_id',
    'tournament_id',
    'event_id',
    'provider_id',
    'structure_name',
    'stage',
    'stage_sequence',
    'structure_type',
    'structure_order',
    'match_up_format',
    'parent_structure_id',
  ],
  seeds: [
    'structure_id',
    'seed_number',
    'tournament_id',
    'event_id',
    'draw_id',
    'seed_value',
    'participant_id',
    'provider_id',
  ],
  courts: [
    'court_id',
    'venue_id',
    'tournament_id',
    'provider_id',
    'court_name',
    'indoor_outdoor',
    'surface_category',
    'surface_type',
    'latitude',
    'longitude',
  ],
  order_of_play: ['tournament_id', 'published', 'scheduled_dates', 'event_ids', 'embargo'],
  scheduling_profile: [
    'tournament_id',
    'schedule_date',
    'venue_id',
    'round_order',
    'event_id',
    'draw_id',
    'structure_id',
    'round_number',
    'round_segment_number',
    'round_segments_count',
    'winner_finishing_position_range',
  ],
  participant_publish: ['tournament_id', 'published', 'embargo'],
  match_ups: [
    'match_up_id',
    'tournament_id',
    'provider_id',
    'parent_match_up_id',
    'collection_id',
    'collection_position',
    'match_up_level',
    'draw_id',
    'event_id',
    'structure_id',
    'venue_id',
    'event_type',
    'round_name',
    'round_number',
    'round_position',
    'winner_match_up_id',
    'loser_match_up_id',
    'match_up_status',
    'winning_side',
    'score_string',
    'tie_value',
    'score_source',
    'match_up_format',
    'scheduled_date',
    'published',
    'embargo',
    'schedule_embargo',
  ],
  match_up_competitors: [
    'match_up_id',
    'tournament_id',
    'side_number',
    'competitor_index',
    'participant_type',
    'side_participant_id',
    'individual_participant_id',
    'person_id',
    'link_source',
    'team_id',
    'provider_id',
    'participant_name',
  ],
  entries: [
    'tournament_id',
    'event_id',
    'participant_id',
    'person_id',
    'provider_id',
    'entry_status',
    'team_id',
    'organisation_id',
  ],
  venues: ['venue_id', 'venue_name', 'facility_id', 'address'],
  tournament_venues: ['tournament_id', 'venue_id'],
  tournament_discovery: [
    'tournament_id',
    'provider_id',
    'start_date',
    'end_date',
    'latitude',
    'longitude',
    'venue_name',
    'city',
    'state',
    'country_code',
    'tournament_level',
    'level_system',
    'level_value',
    'recognition',
    'decision',
    'ranking_eligible',
    'entries_open',
    'entries_close',
    'fee_min',
    'fee_max',
    'fee_currency',
    'fee_unit',
    'event_count',
    'category_types',
    'genders',
    'age_codes',
    'rating_types',
    'cancelled_at',
  ],
} as const satisfies Record<keyof ReadModelRows, readonly string[]>;

/** The element type of a table's row array in {@link ReadModelRows}. */
type RowOf<K extends keyof ReadModelRows> = NonNullable<ReadModelRows[K]>[number];

/** Column names on the row type that this manifest fails to list. */
type Missing<K extends keyof ReadModelRows> = Exclude<
  Extract<keyof RowOf<K>, string>,
  (typeof READ_MODEL_COLUMNS)[K][number]
>;

/** Names this manifest lists that the row type does not have. */
type Surplus<K extends keyof ReadModelRows> = Exclude<
  (typeof READ_MODEL_COLUMNS)[K][number],
  Extract<keyof RowOf<K>, string>
>;

/**
 * `never` when a table's manifest entry matches its row type exactly. Any other type means the two
 * have drifted, and the compiler names the offending columns in the error.
 */
type Exact<K extends keyof ReadModelRows> = Missing<K> | Surplus<K>;

/**
 * Forces the compiler to EVALUATE each `Exact<K>` in a position that can fail.
 *
 * A tuple type whose members happen to be `never` is not an assertion — every member is a valid
 * type either way, so nothing errors and the check is decoration. Falsified on 2026-09-08: an
 * earlier draft of this file used exactly that shape, and neither removing a column from the
 * manifest nor inventing one produced a single diagnostic. A constrained type PARAMETER does fail,
 * because `T extends never` is unsatisfiable for anything else, and the error names the column.
 */
type AssertNever<T extends never> = T;

/**
 * Every table's manifest entry, checked. Exported so it is never an unused local — `noUnusedLocals`
 * rejects a bare `type _Check = …`, and a non-exported alias would be deleted as dead code by the
 * next reader with a linter.
 */
export type ReadModelColumnAssertions = [
  AssertNever<Exact<'tournaments'>>,
  AssertNever<Exact<'events'>>,
  AssertNever<Exact<'draws'>>,
  AssertNever<Exact<'structures'>>,
  AssertNever<Exact<'seeds'>>,
  AssertNever<Exact<'courts'>>,
  AssertNever<Exact<'order_of_play'>>,
  AssertNever<Exact<'scheduling_profile'>>,
  AssertNever<Exact<'participant_publish'>>,
  AssertNever<Exact<'match_ups'>>,
  AssertNever<Exact<'match_up_competitors'>>,
  AssertNever<Exact<'entries'>>,
  AssertNever<Exact<'venues'>>,
  AssertNever<Exact<'tournament_venues'>>,
  AssertNever<Exact<'tournament_discovery'>>,
];

/** Table names the read model projects, as runtime data. */
export const READ_MODEL_TABLES = Object.keys(READ_MODEL_COLUMNS) as (keyof ReadModelRows)[];
