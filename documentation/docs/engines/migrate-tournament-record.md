---
title: migrateTournamentRecord
---

An idempotent ingest/upgrade helper that walks a `tournamentRecord`, promotes the legacy envelopes listed below, and applies versioned repairs. The set of repairs evolves across releases, including 7.x native-record repairs. It mutates the supplied record; inspect `promoted` and `totalPromoted` before persisting the upgrade.

```ts
import { tournamentGovernor } from 'tods-competition-factory';
const { migrateTournamentRecord } = tournamentGovernor;

const { tournamentRecord: legacy } = await loadLegacyRecord();
const { promoted, totalPromoted } = migrateTournamentRecord({ tournamentRecord: legacy });
// legacy is mutated in place — same reference, post-migration shape
// promoted: { events: 4, matchUpScheduleTimeItems: 124, ... }
```

## Inspect a record before migration

Call the standalone query on a stored tournament record at an import or upgrade boundary. It reads the supplied object directly, including frozen records. It works before initializing an engine.

```ts
import { detectLegacyShape } from 'tods-competition-factory';

const inspection = detectLegacyShape(record);
if (inspection.success) {
  const { total, legacyShapes } = inspection;
  console.log(total, legacyShapes.matchUpScheduleTimeItems, legacyShapes.goesTo);
}
```

`legacyShapes` has the same category names as the migration counts below. `total` is their sum. A recognized extension counts once per name and owner when its native destination is undefined. A BRIDGE record can keep the extension alongside a native value such as `false`, `0`, `null` or an empty collection. That pair contributes zero. An authorless sanction extension can be detected even though promotion requires a named authority.

Each schedule attribute counts once per match, including a legacy clear sentinel when the native value is undefined. Participant presence and match check-ins count each history entry when their native arrays are absent. The inspection follows the migration's event, draw, nested structure and owner scopes. Match-level promotions cover matches stored directly on structures. Embedded TEAM tie lines and arbitrary extension payloads are outside that walk.

`drawPositions` counts stored match arrays the migration would compact or reorder. `goesTo` counts draws whose stored progression edges or finishing ranges warrant inspection. This check uses the migration's inexpensive structure-level predicates and skips ad hoc draws. Some matches legitimately have no outgoing edge. One stored edge can satisfy its structure's predicate, even if a sibling's edge is missing. The query neither follows targets nor validates individual links. Migration can consequently write fewer changes than the detector reports.

A missing or invalid record argument returns `MISSING_TOURNAMENT_RECORD`. Ordinary `setState(record)` performs no inspection. A zero count means the detector found no supported signal in its scopes.

## When to call it

Run it at ingest and after upgrading to a version with new repair categories, including for already-native records. Repeating the same supported repairs is safe; an unchanged record can report zero promotions. It is best-effort: unknown envelopes/penalty labels and non-derivable edges remain unchanged, so success does not certify a purely native or fully valid record. It does not reconstruct missing historical exit provenance. Use integrity queries separately.

Common seams:

- **Import / ingestion paths** — a legacy export, a federation feed, a backup restore. Run migration before handing the record to the engine.
- **Storage upgrade scripts** — walk the historical record store once, write back the migrated shape.
- **Mode transitions** — if a server flips `schemaWriteMode` from `legacy` to `native`, migrate previously-saved records before the new mode reads them.

## What it promotes

The walker visits the tournament record, every event, every draw definition, every structure (with its `positionAssignments`), every matchUp, every venue, every court. At each element it lifts:

| Source shape                                                             | New home                                                  | Phase |
| ------------------------------------------------------------------------ | --------------------------------------------------------- | ----- |
| `positionAssignment.extensions[{name: 'tally'}].value`                   | `positionAssignment.tally`                                | 1     |
| `positionAssignment.extensions[{name: 'subOrder'}].value`                | `positionAssignment.subOrder`                             | 1     |
| `matchUp.timeItems[{itemType: SCHEDULED_DATE}].itemValue`                | `matchUp.schedule.scheduledDate`                          | 2     |
| `matchUp.timeItems[{itemType: SCHEDULED_TIME}].itemValue`                | `matchUp.schedule.scheduledTime`                          | 2     |
| `matchUp.timeItems[{itemType: ASSIGN_COURT}].itemValue`                  | `matchUp.schedule.courtId`                                | 2     |
| `matchUp.timeItems[{itemType: ASSIGN_VENUE}].itemValue`                  | `matchUp.schedule.venueId`                                | 2     |
| `matchUp.timeItems[{itemType: COURT_ORDER}].itemValue`                   | `matchUp.schedule.courtOrder`                             | 2     |
| `matchUp.timeItems[{itemType: COURT_ANNOTATION}].itemValue`              | `matchUp.schedule.courtAnnotation`                        | 2     |
| `matchUp.timeItems[{itemType: ALLOCATE_COURTS}].itemValue`               | `matchUp.schedule.allocatedCourts`                        | 2     |
| `matchUp.timeItems[{itemType: TIME_MODIFIERS}].itemValue`                | `matchUp.schedule.timeModifiers`                          | 2     |
| `matchUp.timeItems[{itemType: HOME_PARTICIPANT_ID}].itemValue`           | `matchUp.schedule.homeParticipantId`                      | 2     |
| `matchUp.timeItems[{itemType: ASSIGN_OFFICIAL}].itemValue`               | `matchUp.schedule.official`                               | 2     |
| `event.extensions[{name: 'flightProfile'}].value`                        | `event.flightProfile`                                     | 3     |
| `drawDefinition.extensions[{name: 'lineUps'}].value`                     | `drawDefinition.lineUps`                                  | 3     |
| 8 promoted flat-scalar extensions (DRAFT_STATE, DISABLE_AUTO_CALC, etc.) | matching first-class attribute                            | 4     |
| `tournamentRecord.extensions[{name: 'SCHEDULING_PROFILE'}].value`        | `tournamentRecord.scheduling.profile`                     | 5     |
| `tournamentRecord.extensions[{name: 'SCHEDULE_LIMITS'}].value`           | `tournamentRecord.scheduling.dailyLimits`                 | 5     |
| `tournamentRecord.extensions[{name: 'SCHEDULE_TIMING'}].value`           | `tournamentRecord.scheduling.timing`                      | 5     |
| `tournamentRecord.extensions[{name: 'LINKED_TOURNAMENTS'}]`              | `tournamentRecord.linkedTournamentIds` (shape-translated) | 7     |

A `flightProfile` extension on a **draw definition** is not promoted (since 7.10.0): a flight profile belongs to the event, nothing ever wrote one on a draw, and a stray draw-level extension is left as an extension.

It also rewrites every legacy `participant.penalties[].penaltyType` to its `PenaltyTypeEnum` code, counted as `promoted.penaltyLabels`: a display label written by earlier releases (`'Ball Abuse'` becomes `BALL_ABUSE`) or a misspelled code (`EQUIMENT_VIOLATION`). It is the same rewrite `addPenalty` and `modifyPenalty` apply on write, and it does not depend on `clearLegacy`. A value it does not recognise is left as it is. See [penaltyConstants](../constants.mdx).

It also gives a draw that does not store its progression edges the ones the factory stores on every draw it generates, counted as `promoted.goesTo` (one per draw changed). A record converted from another system may hold no `winnerMatchUpId` / `loserMatchUpId` on its matchUps, and a lone structure from one may carry no `finishingPositionRange`. The migration writes what the draw's links and positions derive: the edges, the loser ranges widened over the loser target, and a lone foreign structure's finishing rounds. This does not depend on `clearLegacy`. Three kinds of draw are left as they are:

- an AD_HOC draw, whose rounds are paired rather than linked;
- a draw with a malformed link (a `WINNER`/`LOSER` link out of an elimination structure with no `source.roundNumber`, an entry of `links` that is not an object, a link to an absent structure), which is never half given its edges. It is reported in `warnings` as `GOES_TO_NOT_STORED`, with its `drawId`, `eventId` and the error the derivation met: a warning, not an error, because every other promotion has been made and the draw itself is unchanged. Repair it with [`repairMalformedLinks`](/docs/governors/draws-governor#repairmalformedlinks) and migrate again;
- a draw whose edges cannot be derived, for example one structure with no links and nothing to follow.

Readers never write these edges themselves: a query derives what it needs on a copy, so a record keeps whatever it was stored with until it is migrated.

For lifecycle timeItems (`START_TIME` / `STOP_TIME` / `RESUME_TIME` / `END_TIME`) — these are **not** promoted; they remain an ordered history that `matchUpDuration()` walks.

## `clearLegacy` flag

```ts
type MigrateTournamentRecordArgs = {
  tournamentRecord: Tournament;
  clearLegacy?: boolean; // default: true
};
```

| Value            | Behavior                                                                                                                                                                                                                                     |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `true` (default) | After promoting an entry, the legacy extension / timeItem is **removed**, so the promoted entries no longer have a legacy copy.                                                                                                              |
| `false`          | Promoted values are copied to their new home; legacy entries are kept. Useful when you want to migrate readers but defer dropping the legacy envelope (e.g., to keep an in-flight `schemaWriteMode: 'bridge'` deployment safe to roll back). |

Existing first-class values are never overwritten — the helper only fills `element[attribute] === undefined`. Running migration twice is a no-op on the second pass.

## Result shape

```ts
type MigrationResult = {
  promoted: {
    tournament: number;
    events: number;
    entries: number;
    drawDefinitions: number;
    structures: number;
    positionAssignments: number;
    matchUps: number;
    matchUpScheduleTimeItems: number;
    matchUpCheckIns: number;
    drawPositions: number;
    goesTo: number; // draws given their progression edges or finishing rounds
    participantPresence: number;
    penaltyLabels: number;
    venues: number;
    courts: number;
  };
  totalPromoted: number; // sum across all categories
  // present only when a draw was left without its edges because of a malformed link
  warnings?: { code: 'GOES_TO_NOT_STORED'; drawId: string; eventId?: string; error?: ErrorType; info?: unknown }[];
  success: true;
  // ResultType base — error?: ErrorType if input was invalid
};
```

The `promoted` counts are diagnostic — they tell you "the record actually had data in this shape". A migration that returns `totalPromoted: 0` is a record that was already native (or had nothing to lift).

## Errors

| `error.code`                | When                                                            |
| --------------------------- | --------------------------------------------------------------- |
| `MISSING_TOURNAMENT_RECORD` | The `tournamentRecord` argument was missing or wasn't an object |

The walker is defensive: missing intermediate collections (`events`, `extensions`, `timeItems`) are treated as empty rather than throwing. Records with partial structure migrate as far as they can.

## See also

- The [4.x to 5.0.0 migration guide](../migration-5.0.0) — full context on the CODES schema initiative and the typed engine default.
- [`schemaWriteMode`](../migration-5.0.0#engine-write-mode-flags) — the engine flag this helper coordinates with.
- [`getTally`](./get-tally.md) — example of a mode-agnostic reader that works against both pre- and post-migration shapes.

Current accepted mode names and read precedence are listed in the [shared write-mode reference](./get-tally.md#supported-write-mode-names).
