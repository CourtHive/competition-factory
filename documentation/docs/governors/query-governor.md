---
title: Query Governor
---

```js
import { queryGovernor } from 'tods-competition-factory';
```

## allDrawMatchUps

Returns all matchUps from all structures within a draw. See examples in [Draw-Specific](../concepts/matchup-overview.md#draw-specific), [Next MatchUps (Winner/Loser Progression)](../concepts/matchup-overview.md#next-matchups-winnerloser-progression), [Next MatchUps (Progression)](../concepts/matchup-context.mdx#next-matchups-progression), [Build Draw Bracket](../concepts/matchup-context.mdx#build-draw-bracket).

```js
const { matchUps } = engine.allDrawMatchUps({
  participantsProfile, // optional - ability to specify additions to context (see parameters of getParticipants())
  contextFilters, // filters based on context attributes
  matchUpFilters, // attribute filters
  nextMatchUps, // optioanl - boolean - to include winnerTo and loserTo
  inContext, // boolean - add context { drawId, structureId, participant, individualParticipants ... }
  context, // optional context to be added into matchUps
  drawId,
});
```

---

## allEventMatchUps

Returns all matchUps for an event. See examples: [Event-Specific](../concepts/matchup-overview.md#event-specific).

```js
const { matchUps } = allEventMatchUps({
  scheduleVisibilityFilters, // { visibilityThreshold: dateString, eventIds, drawIds }
  participantsProfile, // optional - ability to specify additions to context (see parameters of getParticipants())
  matchUpFilters, // optional; [ scheduledDates: [], courtIds: [], stages: [], roundNumbers: [], matchUpStatuses: [], matchUpFormats: []]
  contextFilters, // filters based on context attributes
  nextMatchUps: true, // include winner/loser target matchUp details
  inContext: true, // include contextual details
  eventId,
});
```

---

## allPlayoffPositionsFilled

Returns boolean value for whether playoff positions (which have been generated) are populated with `participantIds` or `BYEs`.

```js
const allPositionsFilled = engine.allPlayoffPositionsFilled({
  structureId,
  drawid,
});
```

---

## allTournamentMatchUps

Return an array of all matchUps contained within a tournament. These matchUps are returned **inContext**. See examples in [Extension Hydration](../concepts/extensions.md#extension-hydration), [Clear Separation](../concepts/publishing/publishing-workflows.md#clear-separation), [Clear Separation](../concepts/publishing/publishing-workflows.md#clear-separation), [MatchUp Time Items](../concepts/timeItems.md#matchup-time-items), [Example Usage](../concepts/matchup-overview.md#example-usage), and 2 more.

```js
const { matchUps, groupInfo } = engine.allTournamentMatchUps({
  scheduleVisibilityFilters, // { visibilityThreshold: dateString, eventIds, drawIds }
  participantsProfile, // optional - ability to specify additions to context (see parameters of getParticipants())
  matchUpFilters, // optional; [ scheduledDates: [], courtIds: [], stages: [], roundNumbers: [], matchUpStatuses: [], matchUpFormats: []]
  contextFilters, // filters based on context attributes
  nextMatchUps, // include winnerTo and loserTo matchUps
  contextProfile, // optional: { inferGender: true, withCompetitiveness: true, withScaleValues: true, exclude: ['attribute', 'to', 'exclude']}
});
```

---

## competitionScheduleMatchUps

Returns scheduled matchUps for a competition, with optional publish-state and embargo filtering. See full documentation in the [MatchUp Governor](./matchup-governor.md#competitionschedulematchups).

---

## drawMatchUps

Returns categorized matchUps from all structures within a draw.

```js
const { upcomingMatchUps, pendingMatchUps, completedMatchUps, abandonedMatchUps, byeMatchUps } = engine.drawMatchUps({
  tournamentAppliedPolicies, // any policies, such as privacy, to be applied to matchUps
  contextFilters, // filters based on context attributes
  matchUpFilters, // attribute filters
  nextMatchUps, // optioanl - boolean - to include winnerTo and loserTo
  inContext, // boolean - add context { drawId, structureId, participant, individualParticipants ... }
  context, // optional context to be added into matchUps
});
```

---

## eventMatchUps

Returns matchUps for an event grouped by status.

```js
const { abandonedMatchUps, byeMatchUps, completedMatchUps, pendingMatchUps, upcomingMatchUps } = engine.eventMatchUps({
  scheduleVisibilityFilters, // { visibilityThreshold: dateString, eventIds, drawIds }
  tournamentAppliedPolicies,
  contextFilters, // optiona; filter by attributes that are only present after matchUpContext has been added (hydration)
  matchUpFilters, // optional; [ scheduledDates: [], courtIds: [], stages: [], roundNumbers: [], matchUpStatuses: [], matchUpFormats: []]
  nextMatchUps, // optional boolean; include winner/loser target matchUp details
  inContext, // optional - adds context details to all matchUps
  eventId,
});
```

---

## getAllEventData

Returns all `matchUps` for all draws in all events along with `tournamentInfo`, `eventInfo`, and `drawInfo`.

```js
const { allEventData } = engine.getAllEventData({
  policyDefinitions, // optional - allows participant data to be filtered via a privacy policy
});

const { tournamentInfo, eventsData, venuesData } = allEventData;
```

---

## getAllStructureMatchUps

```js
const { matchUps } = engine.getAllStructureMatchUps({ drawId, structureId });
```

---

## getAllowedDrawTypes

Returns an array of names of allowed Draw Types, if any applicable policies have been applied to the tournamentRecord.

```js
const drawTypes = engine.getAllowedDrawTypes();
```

---

## getAllowedMatchUpFormats

Returns an array of CODES matchUpFormat codes for allowed scoring formats, if any applicable policies have been applied to the tournamentRecord.

```js
const drawTypes = engine.getAllowedMatchUpFormats();
```

---

## getAvailableMatchUpsCount

```js
const { availableMatchUpsCount } = engine.getAvailableMatchUpsCount({
  structureId, // required if there is more than one structure in the drawDefinition
  roundNumber, // optional; will default to last roundNumber
  drawId,
});
```

---

## getAvailablePlayoffProfiles

If provided a `structureId`, returns rounds of the selected structure which are available for adding playoff structures. See [Finishing Positions](/docs/concepts/finishing-positions#playofffinishingpositionranges) for how these ranges map to overall draw positions.

```js
const { playoffRounds, playoffRoundsRanges, positionsPlayedOff } = engine.getAvailablePlayoffProfiles({
  structureId,
  drawId,
});
```

...for a SINGLE_ELIMINATION struture with `{ drawSize: 16 }` this would return:

```js
{
  playoffRounds: [ 1, 2, 3 ],
  playoffRoundsRanges: [
    { round: 1, range: '9-16' },
    { round: 2, range: '5-8' },
    { round: 3, range: '3-4' }
  ]
}
```

...for a ROUND_ROBIN struture with `{ drawSize: 16 }` and `{ groupSize: 4 }` this would return:

```js
{
    "finishingPositionsAvailable": [ 1, 2, 3, 4 ],
    "playoffFinishingPositionRanges": [
        {
            "finishingPosition": 1,
            "finishingPositions": [ 1, 2, 3, 4 ],
            "finishingPositionRange": "1-4"
        },
        {
            "finishingPosition": 2,
            "finishingPositions": [ 5, 6, 7, 8 ],
            "finishingPositionRange": "5-8"
        },
        {
            "finishingPosition": 3,
            "finishingPositions": [ 9, 10, 11, 12 ],
            "finishingPositionRange": "9-12"
        },
        {
            "finishingPosition": 4,
            "finishingPositions": [ 13, 14, 15, 16 ],
            "finishingPositionRange": "13-16"
        }
    ],
}
```

When no `structureId` is provided, returns an array of `availablePlayoffProfiles` with entries for each structure in a specified `drawDefinition`.

```js
const { availablePlayoffProfiles, positionsPlayedOff } = engine.getAvailablePlayoffProfiles({ drawId });
```

---

## getCheckedInParticipantIds

```js
const {
  allParticipantsCheckedIn, // boolean
  checkedInParticipantIds, // array of participantIds
} = engine.getCheckedInParticipantIds({ matchUp });
```

---

## getCompetitionDateRange

```js
const { startDate, endDate } = engine.getCompetitionDateRange();
```

---

## getCompetitionMatchUps

```js
const { abandonedMatchUps, completedMatchUps, upcomingMatchUps, pendingMatchUps, byeMatchUps, groupInfo, participants } =
 = tournamentEngine.getCompetitionMatchUps();
```

---

## getCompetitionPenalties

Returns an array of all penalties issued for all tournaments loaded into engine.

```js
const { penalties } = engine.getCompetitionPenalties();
```

---

## getCompetitionFormat

Resolves the `competitionFormat` through the hierarchy: structure → draw → event. Returns the first defined value along with each level's individual setting. Accepts any combination of `structureId`, `matchUpId`, `drawId`, or `eventId` to identify the scope.

```js
const {
  structureDefaultCompetitionFormat, // competitionFormat defined on the structure (if any)
  drawDefaultCompetitionFormat, // competitionFormat defined on the drawDefinition (if any)
  eventDefaultCompetitionFormat, // competitionFormat defined on the event (if any)
  competitionFormat, // resolved value: first defined in the hierarchy
} = engine.getCompetitionFormat({
  structureId, // optional - resolve from a specific structure
  matchUpId, // optional - resolve from the matchUp's structure/draw/event
  drawId, // optional - resolve from a specific draw
  eventId, // optional - resolve from a specific event
});
```

---

## getCompetitionVenues

```js
const { venues, venueIds } = engine.getCompetitionVenues();
```

---

## getCourtInfo

```js
const {
  altitude,
  courtId,
  courtName,
  courtDimensions,
  latitude,
  longitude,
  surfaceCategory,
  surfaceType,
  surfacedDate,
  pace,
  notes,
} = engine.getCourtInfo({ courtId });
```

---

## getCourts

Returns courts associated with a tournaments; optionally filter by venue(s).

```js
const { courts } = engine.getCourts({
  venueId, // optional - return courts for a specific venue
  venueIds, // optional - return courts for specified venues
});
```

---

## getDrawData

Primarily used by `getEventData` for publishing purposes.

```js
const {
  drawInfo: {
    drawActive, // boolean - draw has active matchUps
    drawCompleted, // boolean - all draw matchUps are complete
    drawGenerated, // boolean - draw has structures containing matchUps
    participantPlacements, // boolean - whether any participants have been placed in the draw
  },
  structures,
} = engine.getDrawData({
  allParticipantResults, // optional boolean; include round statistics per structure even for elimination structures
  contextProfile, // optional: { inferGender: true, withCompetitiveness: true, withScaleValues: true, exclude: ['attribute', 'to', 'exclude']}
  drawId,
});
```

---

## getDrawParticipantRepresentativeIds

Get the participantIds of participants in the draw who are representing players by observing the creation of the draw.

```js
const { representativeParticipantIds } = engine.getDrawParticipantRepresentativeIds({
  drawId,
});
```

---

## getEligibleVoluntaryConsolationParticipants

```js
const { eligibleParticipants } = engine.getEligibleVoluntaryConsolationParticipants({
  excludedMatchUpStatuses, // optional - array of matchUpStatuses which are excluded from matchUpsLimit
  includeQualifyingStage, // optional - allow losers in qualifying
  finishingRoundLimit, // optional number - limits considered matchUps by finishingRound, e.g. 3 doesn't consider past QF
  roundNumberLimit, // optional number - limits matchUps by roundNumber
  matchUpsLimit, // optional number - limits the number of considered matchUps; works in tandem with excludedMatchUpStatuses
  winsLimit, // defaults to 0, meaning only participants with no wins are eligible
  requireLoss, // optional boolean - defaults to true; if false then all participants who have played and appear in MAIN draw are considered
  requirePlay, // optional boolean - defaults to true; if false then all participants who appear in MAIN draw are considered
  allEntries, // optional boolean - consider all entries, regardless of whether placed in draw
  includeEventParticipants, // optional boolean - consider event entries rather than draw entries (if event is present)
  drawId,
});
```

---

## getEntriesAndSeedsCount

```js
const { error, entries, seedsCount, stageEntries } = engine.getEntriesAndSeedsCount({
  policyDefinitions, // seeding policy which determines # of seeds for # of participants/drawSize
  eventId,
  drawSize, // optional - overrides number calculaed from entries in either event or draw
  drawId, // optional - scopes entries to a specific flight/drawDefinition
  stage, // optional - scopes entries to a specific stage
});. See examples: [Client-Implemented Seeding](../concepts/scaleItems.md#client-implemented-seeding), [Using Factory getScaledEntries()](../concepts/scaleItems.md#using-factory-getscaledentries).
```

---

## getEntryStatusReports

```js
const {
  tournamentEntryReport: {
    nonParticipatingEntriesCount,
    individualParticipantsCount,
    drawDefinitionsCount,
    eventsCount,
  },
  entryStatusReports, // count and pct of total for all entryStatuses for each event
  participantEntryReports, // person entryStatus, ranking, seeding, WTN and confidence for each event
  eventReports, // primarily internal use - entries for each event with main/qualifying seeding
} = engine.getEntryStatusReports();
```

To export reports as CSV:

```js
const entryStatusCSV = tools.JSON2CSV(entryStatusReports);
const personEntryCSV = tools.JSON2CSV(participantEntryReports);
```

---

## getEvent

Get an event by either its `eventId` or by a `drawId` which it contains. Also returns `drawDefinition` if a `drawId` is specified. See examples in [Use Cases](../concepts/events/entries.mdx#use-cases), [Resolving Events from Draw IDs](../engines/engine-middleware.md#resolving-events-from-draw-ids).

```js
const {
  event,
  drawDefinition, // only returned if drawId is specified
} = engine.getEvent({
  eventId, // optional - find event by eventId
  drawId, // optional - find the event which contains specified drawId
});
```

---

## getEvents

Return **deepCopies** of all events in a tournament record. See examples: [Programmatic Generation](../concepts/scheduling-profile.mdx#programmatic-generation), [Setting Active Tournament](../engines/engine-middleware.md#setting-active-tournament), [Single Tournament (No ID Required)](../engines/engine-middleware.md#single-tournament-no-id-required).

```js
const { events } = engine.getEvents({
  withScaleValues, // optional boolean
  scaleEventType, // override event.eventType for accessing scales, e.g. SINGLES override for DOUBLES events
  inContext, // optional boolean hydrates with tournamentId
  eventIds, // optional array
  drawIds, // optional array
  context, // optional object to spread into all targeted events
});
```

---

## getEventData

Returns event information optimized for publishing: `matchUps` have context and separated into rounds for consumption by visualization libraries such as `tods-react-draws`. See examples: [Event Data Payload](../concepts/publishing/publishing-data-subscriptions.md#event-data-payload), [Event Data](../concepts/publishing/publishing-workflows.md#event-data), [Test Publish State](../concepts/publishing/publishing-workflows.md#test-publish-state).

See [Policies](../concepts/policies) for more details on `policyDefinitions`.

```js
const { eventData } = engine.getEventData({
  allParticipantResults, // optional boolean; include round statistics per structure even for elimination structures
  participantsProfile, // optional - ability to specify additions to context (see parameters of getParticipants())
  policyDefinitions, // optional
  usePublishState, // optional - filter out draws which are not published; enforces embargo timestamps
  contextProfile, // optional: { inferGender: true, withCompetitiveness: true, withScaleValues: true, exclude: ['attribute', 'to', 'exclude']}
  eventId,
});
const { drawsData, venuesData, eventInfo, tournamentInfo } = eventData;
```

When `usePublishState: true`, this method enforces [embargo](../concepts/publishing/publishing-embargo) timestamps — embargoed draws, stages, and structures are filtered from `drawsData` until the embargo passes.

**See**: [Embargo](../concepts/publishing/publishing-embargo) for details on how embargo timestamps work.

---

## getStructureInconsistencies

Read-only audit that scans a draw's structures for internal inconsistencies — decided
matchUps whose derived fields have drifted out of agreement. Returns `valid` plus an
`inconsistencies` array (empty when consistent). Intended for tests (assert zero
inconsistencies after mutations), CI fixture sweeps, and operator-facing audits of a
loaded tournament.

```js
const { valid, inconsistencies } = engine.getStructureInconsistencies({
  drawId, // required — resolved to drawDefinition by the engine
  structureId, // optional — restrict the scan to a single structure
});
// inconsistencies: [{ issueType, message, matchUpId, structureId, winningSide, ... }]
```

You can also call it directly against a `drawDefinition` object, without loading a
tournament into the engine — useful when validating records built outside the factory:

```js
import { drawsGovernor } from 'tods-competition-factory';

const { valid, inconsistencies } = drawsGovernor.getStructureInconsistencies({ drawDefinition });
```

### Validating hand-built / reconstructed CODES draws

Beyond internal engine regression testing, this method is a **structural conformance check
for drawDefinitions that were _not_ produced by the factory's own generators**. Third-party
provisioners and ingest pipelines routinely reconstruct CODES draw structures by hand — for
example scraping results from an external provider (IONSport) or reconstructing draws from a
national federation's data (Czech Tennis, ITF, Tennis Europe). Those pipelines have to place
participants into `positionAssignments`, wire `winnerMatchUpId` / `loserMatchUpId` feeds, and
set `winningSide` / `matchUpStatus` on each matchUp — exactly the relationships this checker
audits. Running `getStructureInconsistencies` over a reconstructed `drawDefinition` surfaces
the common reconstruction defects (an advanced participant that disagrees with `winningSide`,
a decided matchUp pointing at an empty drawPosition, an exit code on the wrong side, unsorted
`drawPositions`) as a concrete, machine-readable list of what is missing or wrong — before the
record is published or fed into ranking / scheduling. It complements `analyzeDraws` /
`getDrawData` (which describe a draw) by _asserting_ that its decided state is self-consistent.

Checks (each a distinct `issueType`):

- `WINNING_SIDE_WITHOUT_PARTICIPANT` — a non-exit decided matchUp whose winning side
  holds no participant. Legitimately pending propagated exits (a `WALKOVER`/`DEFAULTED`
  whose winner slot is still an empty feed) are not flagged.
- `WINNING_SIDE_ADVANCEMENT_MISMATCH` — the losing-side participant advanced into the
  `winnerMatchUp` while the winning-side participant did not (the
  `winningSide`/`drawPositions` drift class).
- `WINNER_NOT_ADVANCED` — a decided matchUp's winning-side participant is absent from its next
  matchUp **within the same structure**. Winning advances unconditionally within a structure, so
  the winner must be present. Cross-structure `winnerMatchUpId` feeds are **excluded** because they
  are conditional on history — e.g. a `DOUBLE_ELIMINATION` consolation-final winner feeds back into
  MAIN only if they have lost exactly once; the pointer is present but unused otherwise (the winner
  mirror of the FMLC loser-feed caveat that makes cross-structure progression a deferred sub-phase).
- `DRAW_POSITIONS_NOT_SORTED` — a matchUp's `drawPositions` are not stored in ascending
  order (the sort invariant the engine relies on to derive sides, fed positions, and
  rendering).
- `EXIT_CODE_ON_WINNER_SIDE` — on a single `WALKOVER`/`DEFAULTED`, a status code sits on
  the winning side rather than the exiting (loser) side.
- `EXIT_WITHOUT_LOSER` — a single `WALKOVER`/`DEFAULTED` with a `winningSide` whose losing
  side holds a **fed** drawPosition but no participant (an orphaned exit — nobody who walked
  over). Three legitimate empty-loser cases are excluded: a pending exit (the loser side
  holds the exit carrier); an exit whose losing slot was never fed because an upstream
  double-exit produced no advancer; and an exit the engine _produced_ by propagation into a
  fed-but-empty slot (marked with a `previousMatchUpStatus` provenance code — e.g. a
  consolation walkover fed a double-walkover void).
- `DRAW_POSITION_UNASSIGNED` — a decided, non-exit matchUp references a drawPosition whose
  stored `positionAssignment` holds no participant, bye or qualifier (a phantom position).
  Evaluated over **stored** structure state (`drawPositions` ↔ `positionAssignments`) rather
  than inContext sides: inContext derives sides _from_ the assignments, so an empty **losing**
  slot on an otherwise-decided matchUp silently resolves to a side with no `participantId` and
  is not surfaced by any inContext check (`WINNING_SIDE_WITHOUT_PARTICIPANT` inspects only the
  winning side). Exits are excluded because a legitimately pending propagated exit may hold an
  empty slot. The result carries `phantomPositions` (the offending drawPositions).

The `winningSide`/`drawPositions` and stored-vs-inContext passes are exercised together by a
CI-style engine-consistency guard (`getStructureInconsistenciesCorpus.test.ts`) that generates
every supported draw type at sizes 8/16/32/64, seeds each with a mix of
`WALKOVER`/`DEFAULTED`/`RETIRED`/`DOUBLE_WALKOVER` outcomes, completes it, and asserts zero
inconsistencies — so the checker doubles as a regression guard on exit-propagation and
advancement drift across the generators.

### Deferred check: `STALE_EXIT_STATUS`

A proposed check — a single `WALKOVER`/`DEFAULTED` with a `winningSide`, no exit status code,
and no upstream feeder that is itself an exit (an exit that should have collapsed to
`TO_BE_PLAYED`) — is intentionally **not** implemented. It cannot be made zero-false-positive
from stored state: a legitimate direct walkover is stored with empty `matchUpStatusCodes`, has
a `winningSide`, and has no upstream exit — indistinguishable from the hypothesised stale exit.
`matchUpStatusCodes` is optional metadata that legitimate walkovers routinely omit, so the
heuristic would flag the entire codeless-walkover population. A trustworthy version would need
to re-derive whether the exit is still justified at the mutation boundary that produces it, not
as a read-only post-hoc scan.

## getStructureCompleteness

The **companion** to `getStructureInconsistencies`. Where the inconsistency checker asks _"is the
decided state self-consistent?"_, completeness asks _"what is still missing before the draw is
fully populated and played?"_ — the question a manual position-assignment workflow or a
third-party CODES reconstruction pipeline needs answered at a publish checkpoint. An unassigned
drawPosition or an unplayed matchUp is a valid in-progress state, **not** a defect, so it is
deliberately reported separately from the inconsistency checks (which stay silent for
in-progress draws).

```js
const { complete, completeness } = engine.getStructureCompleteness({
  drawId, // required — resolved to drawDefinition by the engine
  structureId, // optional — restrict the scan to a single structure
});
// complete: true when nothing is outstanding across the scanned structures
// completeness: {
//   unassignedPositionCount,   // total empty positionAssignments (no participant/bye/qualifier)
//   unplayedMatchUpCount,      // total matchUps with no winningSide and no completed status
//   structures: [{ structureId, structureName, stage, unassignedPositions, unplayedMatchUps }]
// }
```

Only structures with something outstanding appear in `completeness.structures`; a fully populated
and played draw returns `complete: true` with an empty array. A matchUp counts as played when it
has a `winningSide`, is a `BYE`, or carries a completed status that resolves without a winner
(`DOUBLE_WALKOVER` / `DOUBLE_DEFAULT` / `CANCELLED` / `ABANDONED` / `DEAD_RUBBER`). Like the
inconsistency checker it reads stored structure state, so it also runs directly against a
hand-built `drawDefinition`:

```js
import { drawsGovernor } from 'tods-competition-factory';

const { complete, completeness } = drawsGovernor.getStructureCompleteness({ drawDefinition });
```

Pair the two for reconstruction pipelines: `getStructureInconsistencies` proves the decided state
is correct, `getStructureCompleteness` enumerates what remains to be filled in.

## The integrity query hierarchy (draw / event / tournament)

`getStructureInconsistencies` / `getStructureCompleteness` are the **leaf** of a four-level
hierarchy that mirrors the data hierarchy. Each higher level fans out to the level below and adds
checks that are only visible at its own level — relationships the lower level cannot see:

```text
getTournamentInconsistencies   cross-event checks (identity duplication)
  └─ getEventInconsistencies    eventType ↔ participantType coherence
      └─ getDrawInconsistencies  cross-structure LINK integrity
          └─ getStructureInconsistencies   (leaf)
```

The `*Completeness` functions compose the same way (`getDrawCompleteness` → `getEventCompleteness`
→ `getTournamentCompleteness`), rolling up `unassignedPositionCount` / `unplayedMatchUpCount` while
preserving the per-draw / per-event breakdown.

### Inconsistency envelope

Every inconsistency returned anywhere in the hierarchy carries a common shape:

```js
// {
//   issueType,     // the specific check that fired
//   message,       // human-readable description
//   severity,      // 'error' | 'warning' | 'info' — route alerts on this
//   scope,         // 'STRUCTURE' | 'DRAW' | 'EVENT' | 'TOURNAMENT' — where the check lives
//   tournamentId, eventId, drawId, structureId, matchUpId,  // provenance (stamped as it bubbles up)
//   fingerprint,   // stable hash of the identity fields — dedup key
//   ...            // issue-specific detail
// }
```

Provenance is **stamped as results bubble up**: a `STRUCTURE`-scoped leaf issue keeps its scope,
but the draw layer stamps `drawId`, the event layer `eventId`, the tournament layer `tournamentId`,
recomputing the `fingerprint` at each level so it reflects every id known there. The `fingerprint`
is a deterministic FNV-1a hash of the identity fields (`issueType` + all ids) — a consumer scanning
repeatedly can dedup on it (the same defect produces the same fingerprint every scan) and route on
`severity`. These functions stay **pure** — they return data and know nothing of transport,
alerting, or storage.

## getDrawInconsistencies

The **draw** layer. Fans out to `getStructureInconsistencies` for every structure of the draw and
adds the checks that require the whole draw in view — the integrity of the cross-structure `links`:

```js
const { valid, inconsistencies } = engine.getDrawInconsistencies({ drawId });
// or, directly against a record built outside the factory:
import { drawsGovernor } from 'tods-competition-factory';
const { valid, inconsistencies } = drawsGovernor.getDrawInconsistencies({ drawDefinition });
```

Draw-level checks (in addition to every structure-level `issueType`):

- `DANGLING_LINK` — a link whose `source` or `target` `structureId` is not a structure in the draw.
  Detected structurally **before** fan-out, because inContext derivation itself throws on such a
  draw. (error)
- `LINK_MISSING_SOURCE_ROUND` — a `WINNER`/`LOSER` link with no `source.roundNumber`; the engine
  cannot determine which round feeds the target. (error)
- `SCAN_ERROR` — structure-level derivation threw on this draw (corrupt state the leaf could not
  read); surfaced rather than allowed to crash the scan. (error)
- `DROPPED_PROGRESSION` — a `LOSER`- or `WINNER`-linked source matchUp whose feeding participant is
  **eligible** to feed the target structure yet is absent from its `positionAssignments` — a
  consolation or feed-back progression that silently failed. The `direction` field records `LOSER`
  vs `WINNER`. (error)

**Sound progression via the engine's own feed logic.** The link alone over-approximates feeding, so
`DROPPED_PROGRESSION` reuses the engine's actual positioning logic per direction:

- **`LOSER`** — whether a loser feeds depends on eligibility the link does not encode (a
  `FIRST_MATCH_LOSER_CONSOLATION` round-2 link feeds only players whose first match _was_ round 2 —
  zero prior scored wins). The check reuses `isFedLoserEligible`, which shares `getDrawPositionWinCount`
  with `directLoser` (the mutation-time positioning code), so check and engine cannot diverge.
- **`WINNER`** — `directWinner` places the winner into any open target position **unconditionally**
  (verified: zero absent across many completed double-elimination draws), so no predicate is needed.
  The sole exception is a `QUALIFYING` source, whose winners are placed by a separate deferred
  qualifier mutation and are therefore not asserted here.

> **Still deferred — qualifier-slot resolution.** Qualifying → main placement (filling
> `qualifier`-marked positions after the qualifying structure completes) is its own mechanism and a
> later sub-phase.

## getDrawCompleteness

The **draw** layer of the completeness roll-up. `getStructureCompleteness` already aggregates every
structure of the draw, so this stamps `drawId` for provenance and is the composition point the event
layer rolls up.

```js
const { complete, completeness } = engine.getDrawCompleteness({ drawId });
// completeness: { drawId, unassignedPositionCount, unplayedMatchUpCount, structures: [...] }
```

## getEventInconsistencies

The **event** layer. Fans out to `getDrawInconsistencies` for every `drawDefinition` (stamping
`eventId`) and adds the check only visible at the event level: whether the participantTypes actually
assigned in the event's draws are consistent with the event's `eventType`.

```js
const { valid, inconsistencies } = engine.getEventInconsistencies({ eventId });
```

- `EVENT_PARTICIPANT_TYPE_MISMATCH` — a participant whose `participantType` is inconsistent with the
  `eventType` is assigned in one of the event's draws (a `DOUBLES` event carrying an `INDIVIDUAL`
  participant, a `SINGLES` event carrying a `PAIR`, etc.). `HYBRID` events legitimately carry both
  `INDIVIDUAL` and `PAIR`. Reads stored `positionAssignments` and resolves each participant's type
  via the participant map. (error)

> The expected participantType is derived by the shared `expectedParticipantType(eventType)` helper —
> the same single source of truth `checkValidEntries` uses for entry validation. Entries-vs-placed
> drift and gender/category eligibility are deferred to a later sub-phase.

## getEventCompleteness

The **event** layer of the completeness roll-up: aggregates `getDrawCompleteness` across the event's
draws, preserving the per-draw breakdown for a director-facing progress view.

```js
const { complete, completeness } = engine.getEventCompleteness({ eventId });
// completeness: { eventId, unassignedPositionCount, unplayedMatchUpCount, byDraw: [...] }
```

## getTournamentInconsistencies

The **top** layer. Fans out to `getEventInconsistencies` for every event (resolving the participant
map once for reuse, stamping `tournamentId`) and adds the checks only visible tournament-wide:

```js
const { valid, inconsistencies } = engine.getTournamentInconsistencies();
```

- `PARTICIPANT_IDENTITY_DUPLICATION` — a single person (`personId`) is represented by more than one
  distinct `INDIVIDUAL` participant; the classic merged/imported-data defect that silently splits a
  competitor's results across two identities. (warning)

> Scheduling collisions and date containment are deferred — they require the scheduling model and are
> a later sub-phase.

## getTournamentCompleteness

The **top** layer of the completeness roll-up: aggregates `getEventCompleteness` across the
tournament's events, preserving the per-event breakdown.

```js
const { complete, completeness } = engine.getTournamentCompleteness();
// completeness: { tournamentId, unassignedPositionCount, unplayedMatchUpCount, byEvent: [...] }
```

## getTournamentActionableMatchUps

Reports whether a tournament is **effectively complete** — nothing is left to score — which is
looser than the strict `getTournamentCompleteness` roll-up. Every non-BYE matchUp is classified:

- **decided** — has a `winningSide`, or a terminal `completedMatchUpStatus` (COMPLETED / RETIRED /
  WALKOVER / DEFAULTED / DOUBLE_* / **ABANDONED** / **CANCELLED** / DEAD_RUBBER).
- **actionable** — `IN_PROGRESS` / `SUSPENDED`, or `readyToScore` with no winner. The only matchUps
  that can still be scored, so the only ones that block completion.
- **pending** — not ready and not decided (waiting on upstream). A pending matchUp whose feeders are
  terminal-without-advancer (e.g. both abandoned) can never become ready, so it does **not** block.

`effectivelyComplete` is true when there are **no actionable matchUps**. This surfaces the case where
every ready-to-score matchUp was abandoned as complete, which strict completeness would not.

```js
const { effectivelyComplete, allDecided, counts, actionableMatchUpIds } = engine.getTournamentActionableMatchUps();
// counts: { total, decided, actionable, pending }
// effectivelyComplete === (counts.actionable === 0)
// allDecided === (counts.actionable === 0 && counts.pending === 0)
```

## getMatchUpFormatVariance

Reports where a draw's `matchUpFormat` (scoring format) is **not uniform**, grouped by structure
and round. Two kinds of variance mean very different things to a tournament director, and the query
separates them:

- **Within-structure** variance — a structure's own matchUps do not all share one format. A round
  that departs from the structure's dominant format and then a later round that **returns** to it
  (`revertPattern`) is the fingerprint of an in-tournament format change: e.g. a weather event that
  shortened a day's matches, then a return to the original format the next day. This is the notable
  signal.
- **Cross-structure** variance — different structures use different formats (MAIN plays best-of-3,
  CONSOLATION plays a match tiebreak). Expected and deliberate; reported informationally, never
  flagged as within-structure variance.

```js
const { hasVariance, variance } = engine.getMatchUpFormatVariance({
  drawId, // required — resolved to drawDefinition by the engine
  structureId, // optional — restrict the scan to a single structure
});
// hasVariance: true when any structure has within-structure variance
// variance: {
//   structures: [{
//     structureId, structureName, stage,
//     baselineFormat,          // the structure's dominant (most common) format
//     distinctFormats,         // every format seen in the structure
//     rounds: [{ roundNumber, formats, differsFromBaseline }],
//     withinStructureVariance, // true
//     revertPattern,           // departed from baseline then returned (weather signal)
//   }],
//   crossStructureVariance,    // structures use different dominant formats (informational)
//   crossStructureFormats,     // the distinct dominant formats across structures
// }
```

Variance is measured on the **raw `matchUpFormat` string** — nothing is parsed, normalized or
collapsed. Any difference in the string is a real difference in the format: a change in set count,
games per set, no-ad, the final-set spec (`-F:TB10` = a match-tiebreak deciding set, shorter if the
match goes the distance) or the tiebreak trigger point are all deliberate scoring choices. Only
matchUps that carry format **evidence** participate — an explicit matchUp-level `matchUpFormat` or a
played result — so a future, unplayed, format-less matchUp (which merely inherits the current
default) cannot manufacture false variance against rounds that carry stamped formats. Team ties
(`collectionId` matchUps, which carry a `tieFormat` rather than a `matchUpFormat`) are excluded.

Like the integrity queries it reads stored structure state, so it also runs directly against a
hand-built `drawDefinition`:

```js
import { drawsGovernor } from 'tods-competition-factory';

const { hasVariance, variance } = drawsGovernor.getMatchUpFormatVariance({ drawDefinition });
```

## getTimeItem

```js
const { timeItem } = engine.getTimeItem({
  itemType: ADD_SCALE_ITEMS,
  itemSubTypes: [SEEDING], // optional
  participantId, // optional
  eventId, // optional
  drawId, // optional
});. See examples: [Retrieving Time Items](../concepts/timeItems.md#retrieving-time-items), [External Ranking Integration](../concepts/timeItems.md#external-ranking-integration).
```

Or call without engine:

```js
getTimeItem({
  tournamentRecord, // optional
  drawDefinition, // optional
  itemSubTypes, // optional
  itemType, // required
  element, // optional - arbitrary element, e.g. participant
  event, // optional
});
```

---

## getEventProperties

Gather attributes of events which come from other tournament elements, e.g. participants which have rankings/ratings/seedings for a given event.

```js
const { entryScaleAttributes, hasSeededParticipants, hasRankedParticipants, hasRatedParticipants } =
  engine.getEventProperties({ eventId });
```

... where **entryScaleAttributes** is an array of `{ participantId, participantName, seed, ranking, rating }`

---

## getEventMatchUpFormatTiming

Method is used internally in advanced scheduling to determine averageMatchUp times for matchUps within an event.

Requires an array of `matchUpFormats` either be defined in scoring policy that is attached to the tournamentRecord or an event, or passed in as parameter. `matchUpFormats` can be passed either as an array of strings, or an array of `[{ matchUpFormat }]`.

```js
const { eventMatchUpFormatTiming } = engine.getEventMatchUpFormatTiming({
  matchUpFormats, // optional - can be retrieved from policy
  categoryType, // optional - categoryType is not part of CODES or event attributes, but can be defined in a policy
  eventId,
});
```

---

## getEventStructures

```js
const { structures, stageStructures } = engine.getEventStructures({
  withStageGrouping: true, // optional return structures grouped by stages
  stageSequences, // optional - specify stageSequences to include
  stageSequence, // optional - filter by stageSequence
  stages, // optional - specify stageSequences to include
  stage, // optional - filter by stage
  eventId, // REQUIRED
});
```

---

## getFlightProfile

A `flightProfile` is an extension on an `event` detailing the parameters that will be used to generate `drawDefinitions` within the `event`. There is an array of `flights` which specify attributes of a draw such as `drawEntries, drawName, drawId, flightNumber` as well as `stage`, which is significant for flights which are only intended to reflect VOLUNTARY_CONSOLATION structures. A Voluntary Consolation flight is "linked" to the flight from which competitors originate and will be automatically deleted if the source flight is deleted. See examples: [Creating Draws from Flight Profiles](../concepts/events/flights.mdx#creating-draws-from-flight-profiles).

If a `flight` has already been used to generate a draw, the `drawDefinition` will be returned with the profile.

```js
const { flightProfile } = engine.getFlightProfile({ eventId });
```

---

## getMatchUpCompetitiveProfile

Returns a categorization of a matchUp as "Competitive", "Routine" or "Decisive"

```js
const {
  competitiveness, // [COMPETITIVE, DECISIVE, ROUTINE]
  pctSpread, // 0-100 - rounded loser's percent of games required to win
} = engine.getMatchUpCompetitiveProfile({
  profileBands, // optional { [DECISIVE]: 20, [ROUTINE]: 50 } // can be attached to tournamentRecord as a policy
  matchUp,
});
```

---

## getMatchUpContextIds

Convenience method to get "context" ids for a `matchUp` by `matchUpId`. Requires an array of "inContext" `matchUps`.

```js
const { matchUpId, drawId, eventId, structureId, tournamentId } = engine.getMatchUpContextIds({
  matchUpId,
  matchUps,
});
```

---

## getMatchUpDependencies

Builds a directed acyclic graph (DAG) of matchUp dependencies across all structures within a draw or across all draws in a tournament/competition. For every `matchUpId` the result contains the complete set of upstream matchUps that must finish first, downstream matchUps that depend on this one, optional participant tracking, and source information grouped by round distance.

This is the factory's authoritative source for scheduling constraint data and is used internally by all automated scheduling paths.

### Parameters

```js
const result = engine.getMatchUpDependencies({
  includeParticipantDependencies, // optional boolean (default false) — when true, accumulates
  // all potential participantIds for each matchUp transitively
  drawDefinition, // optional — scope to a single draw definition
  matchUps, // optional — pre-fetched matchUps (must be inContext); avoids re-fetching
  matchUpIds, // optional — restrict dependency checking to specific matchUpIds
  drawIds, // optional — restrict to specific drawIds
});
```

When called via a competition engine, `tournamentRecords` is supplied automatically. When calling the governor directly, pass either `tournamentRecord` or `tournamentRecords`.

### Return Value

```js
const {
  matchUpDependencies, // Record<matchUpId, DependencyEntry>
  sourceMatchUpIds, // Record<matchUpId, string[]> — direct feeder matchUpIds (non-transitive)
  positionDependencies, // Record<structureId, string[]> — cross-structure POSITION link dependencies
  matchUps, // HydratedMatchUp[] — the matchUps used for analysis
  success, // boolean
} = result;
```

#### DependencyEntry

Each entry in `matchUpDependencies` has the following shape:

```js
matchUpDependencies[matchUpId] = {
  matchUpIds: string[],           // transitive closure of ALL upstream matchUpIds
  dependentMatchUpIds: string[],  // direct downstream matchUpIds (matchUps that depend on this one)
  participantIds: string[],       // all potential participantIds (when includeParticipantDependencies is true)
  sources: string[][],            // upstream matchUpIds grouped by round distance:
                                  //   sources[0] = direct feeders (1 round back)
                                  //   sources[1] = 2 rounds back
                                  //   sources[2] = 3 rounds back, etc.
};
```

#### sourceMatchUpIds vs matchUpIds

- `sourceMatchUpIds[matchUpId]` contains only the **direct** feeder matchUpIds (the two matchUps whose winner/loser feeds into this one)
- `matchUpDependencies[matchUpId].matchUpIds` contains the **complete transitive closure** — every matchUp in the entire upstream chain

#### positionDependencies

For draws that use **POSITION links** (e.g., Round Robin → Playoff, Swiss → Playoff), `positionDependencies` maps a source `structureId` to all `matchUpIds` within that structure. This captures the constraint that _every_ matchUp in the source structure must complete before _any_ matchUp in the linked target structure can begin.

```js
positionDependencies = {
  [sourceStructureId]: [matchUpId1, matchUpId2, ...], // all matchUpIds in the source structure
};
```

### Cross-Structure Awareness

`getMatchUpDependencies` follows **all** draw link types:

| Link Type                                             | How It's Captured                                                                                                          |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **Winner progression** (elimination draws)            | `winnerMatchUpId` on each matchUp                                                                                          |
| **Loser progression** (consolation, compass, feed-in) | `loserMatchUpId` on each matchUp                                                                                           |
| **POSITION links** (RR → Playoff, Swiss → Playoff)    | `positionDependencies` — all matchUps in the source structure become dependencies of every matchUp in the target structure |

This means a consolation Round 1 matchUp will correctly list the main draw Round 1 matchUp it depends on (via `loserMatchUpId`), and a playoff matchUp after a Round Robin will list every RR group matchUp as a dependency.

### Usage Example

```js
const { matchUpDependencies, sourceMatchUpIds, positionDependencies } = engine.getMatchUpDependencies({
  includeParticipantDependencies: true,
});

// Check what must complete before a specific matchUp
const deps = matchUpDependencies[targetMatchUpId];
console.log(`${deps.matchUpIds.length} upstream matchUps must complete first`);
console.log(`${deps.participantIds.length} potential participants`);

// Check direct feeders only
const feeders = sourceMatchUpIds[targetMatchUpId];
console.log(`${feeders.length} direct feeder matchUps`);

// Check round distance
const oneRoundBack = deps.sources[0]; // direct feeders
const twoRoundsBack = deps.sources[1]; // feeders of feeders
```

### Role in Automated Scheduling

`getMatchUpDependencies` is the foundation of the factory's scheduling constraint enforcement. The [automated scheduling](../concepts/automated-scheduling) pipeline calls it early in the process (step 2 of [scheduleProfileRounds](../concepts/automated-scheduling#pseudocode)) and threads the dependency data through four constraint functions:

| Function                     | Constraint                                                                                                                 | Uses                              |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| `checkDependenciesScheduled` | **Gate**: all upstream matchUps must already be scheduled before this one can be assigned a time                           | `matchUpIds` (transitive closure) |
| `checkDependentTiming`       | **Gate**: scheduling this matchUp must not create a timing conflict with already-scheduled downstream matchUps             | `dependentMatchUpIds`             |
| `checkRecoveryTime`          | **Gate**: every potential participant must have sufficient rest (`timeAfterRecovery`) since their last scheduled matchUp   | `participantIds`                  |
| `updateTimeAfterRecovery`    | **State**: after scheduling a matchUp, updates the recovery deadline for all potential participants in downstream matchUps | `participantIds`                  |

The [pro scheduler](../concepts/pro-scheduling) uses the same dependency data in its `proConflicts` post-hoc analysis to detect ordering violations, court double-bookings, and insufficient recovery gaps.

### Relationship to the Scheduling Profile

The [scheduling profile](../concepts/scheduling-profile) defines _which_ rounds to schedule on each date/venue. `getMatchUpDependencies` enforces _whether_ that ordering is valid:

- **Profile validation**: The factory's `getSchedulingProfileIssues()` method calls `getMatchUpDependencies` and checks that no matchUp appears _after_ a matchUp it depends on within the profile ordering. It returns `profileIssues` with the violating round indices.
- **Profile building**: Applications that build scheduling profiles interactively (e.g., using the `courthive-components` scheduling profile builder) can use the dependency data to validate the profile in real time before it is submitted for execution.

### DependencyAdapter Pattern

The `courthive-components` library provides a **DependencyAdapter** that lifts matchUp-level dependencies to round-level for scheduling profile validation:

```ts
interface DependencyAdapter {
  getRoundDependencies: (roundKeyString: string) => string[];
}
```

The adapter is built from `getMatchUpDependencies` results:

1. Call `getMatchUpDependencies({ includeParticipantDependencies: true })` on the factory engine
2. Build a `matchUpId → roundKey` index where `roundKey` is a compound string `"tournamentId|eventId|drawId|structureId|roundNumber"`
3. For each matchUp, map its upstream `matchUpIds` to their corresponding `roundKey` values
4. Aggregate to produce round-level dependencies: "Round A depends on Round B" if _any_ matchUp in Round A has a dependency on _any_ matchUp in Round B

The adapter enables the profile builder to detect:

- **Cross-date violations**: a round scheduled on Day 1 that depends on rounds not scheduled until Day 2
- **Cross-structure violations**: rounds from linked structures scheduled in the wrong order on the same day (e.g., consolation R1 before main draw R1)
- **Missing prerequisite rounds**: rounds scheduled that depend on rounds not present in the profile at all

These are surfaced as `DEPENDENCY_VIOLATION` issues with suggested fix actions (`MOVE_ITEM_AFTER`, `MOVE_ITEM_BEFORE`, `JUMP_TO_ITEM`).

:::tip
**Performance**: `getMatchUpDependencies` walks all matchUps and builds transitive closures. For large tournaments, compute the result once per session and cache it. The dependency graph is stable unless draws are regenerated or entries change. Pass cached `matchUps` via the `matchUps` parameter to avoid redundant matchUp fetching.
:::

---

## getMatchUpFormat

Returns `matchUpFormat` codes for specified context(s). Refer to `getMatchUpFormat.test.js` for specfic use cases.

`matchUpFormat` for each matchUp is determined by traversing the hierarchy: `matchUp => stucture => drawDefinition => event`

```js
const { matchUpFormat, structureDefaultMatchUpFormat, drawDefaultMatchUpFormat, eventDefaultMatchUpFormat } =
  engine.getMatchUpFormat({
    eventId,
    drawId,
    structureId,
    matchUpId,
  });
```

---

## getMatchUpFormatTiming

Searches for policy definitions or extensions to determine the `averageMinutes` and `recoveryMinutes` for a given `matchUpFormat`. Extensions are considered to be overrides of policy definitions.

```js
const { averageMinutes, recoveryMinutes } = engine.getMatchUpFormatTiming({
  defaultAverageMinutes, // optional setting if no matching definition found
  defaultRecoveryMinutes, // optional setting if no matching definition found
  matchUpFormat,
  categoryName, // optional
  categoryType, // optional
  eventType, // optional - defaults to SINGLES; SINGLES, DOUBLES
  eventId, // optional - prioritizes policy definition attached to event before tournament record
});
```

---

## getMatchUpFormatTimingUpdate

Returns an array of methods/params necessary for updating a remote instance of a tournamentRecord to match a local instance. This method enables multiple "provisional" updates to be made on a local document without contacting a server; support deployments where a server is considered "master".

```js
const { methods } = engine.getMatchUpFormatTimingUpdate();
```

---

## getMatchUpScheduleDetails

Returns the latest values for all `matchUp.timeItems`, along with calculated values, that relate to the scheduling of a `matchUp`.

```js
const {
  schedule: {
    time,
    courtId,
    venueId,
    startTime,
    endTime,
    milliseconds,
    scheduledDate,
    scheduledTime,
    allocatedCourts: [{ venueId, courtid }], // applies only to TEAM matchUps
  },
} = engine.getMatchUpScheduleDetails({
  scheduleVisibilityFilters, // { visibilityThreshold: dateString, eventIds, drawIds }
  matchUp,
});
```

---

## getMatchUpsStats

Returns percentages of matchUps which fall into `cmpetitiveBands` defined as "Competitive", "Routine", and "Decisive".

```js
const { competitiveBands } = engine.getMatchUpsStats({
  profileBands, // optional { [DECISIVE]: 20, [ROUTINE]: 50 } // can also be set in policyDefinitions
  matchUps,
});
```

---

## getMatchUpDailyLimits

Returns player daily match limits for singles/doubles/total matches.

```js
const { matchUpDailyLimits } = tournamentId.getMatchUpDailyLimits();
const { DOUBLES, SINGLES, total } = matchUpDailyLimits;
```

---

## getModifiedMatchUpFormatTiming

Returns `averageTimes` and `recoveryTimes` configuration objects for specified `matchUpFormat`. Useful before calling `modifyMatchUpFormatTiming` to preserve existing modifications.

```js
const { matchUpFormat, averageTimes, recoveryTimes } = engine.getModifiedMatchUpFormatTiming({
  matchUpFormat, // CODES matchUpFormat code
  event, // optional - include event in scope for search
});
```

---

## getPairedParticipant

Returns the `{ participantType: PAIR }`, if any, which contains the specified `individualParticipantIds`.

```js
const { participant } = engine.getPairedParticipant({
  participantIds: individualParticipantIds,
});
```

---

## getParticipantEventDetails

Returns an array of eventDetails in which a specified `participantId` appears. For details on draw entry within events use `engine.getParticipants({ inContext: true })`.

```js
const { eventDetails } = engine.getParticipantEventDetails({
  participantId,
});

const [{ eventName, eventId }] = eventDetails;
```

---

## getParticipantIdFinishingPositions

Returns the Range of finishing positions possible for all participantIds within a draw

```js
const idMap = engine.getParticipantIdFinishingPositions({
  byeAdvancements, // optional boolean - whether or not to consider byeAdvancements
  drawId,
});

const { relevantMatchUps, finishingPositionRanges, finishingPositionRange } = idMap['participantId'];
```

---

## getParticipantMembership

Returns all grouping participants which include `participantId` in `{ individualParticipantIds }`. See examples: [Participant Membership](../concepts/participants.md#participant-membership).

```js
const {
  [PAIR]: doublesParticipantIds,
  [GROUP]: groupParticipantIds,
  [TEAM]: teamParticipantIds,
} = engine.getParticipantMembership({
  participantId,
});
```

---

## getParticipantResults

```js
const { participantResults } = engine.getParticipantResults({
  participantIds, // optional array to filter results; used in ROUND_ROBIN for groups
  tallyPolicy, // policyDefinition for tallying results
  matchUps, // must be inContext matchUps
});
```

---

## getParticipants

Returns **deepCopies** of competition participants filtered by participantFilters which are arrays of desired participant attribute values. This method is an optimization of `getCompetitionParticipants` and will replace it going forward. See examples in [Basic Retrieval](../concepts/participants.md#basic-retrieval), [Participants](../concepts/publishing/publishing-participants.md), [withMatchUps](../concepts/participant-context.md#withmatchups), [Participant Filtering](../concepts/accessors.mdx#participant-filtering), [Basic Conflict Detection](../concepts/scheduling-conflicts.mdx#basic-conflict-detection), and 1 more.

```js
const participantFilters = {
  accessorValues: [{ accessor, value }], // optional - see Accessors in Concepts
  eventEntryStatuses, // boolean
  participantTypes: [INDIVIDUAL],
  participantRoles, [COMPETITOR],
  signInStatus, // specific signIn status
  eventIds, // events in which participants appear
};
const {
  participantIdsWithConflicts, // returns array of participantIds which have scheduling conflicts
  competitionParticipants,
  eventsPublishStatuses,
  derivedEventInfo,
  derivedDrawInfo,
  participantMap, // object { ['participantId']: participant } - NOTE: Not fully hydrated
  mappedMatchUps, // object { [matchUpId]: matchUp }; when { withMatchUps: true }
  participants, // array of hydrated participants
  matchUps, // array of all matchUps; when { withMatchUps: true }
 } =
  engine.getParticipants({
    convertExtensions, // optional - BOOLEAN - convert extensions so _extensionName attributes
    participantFilters, // optional - filters
    policyDefinitions, // optional - can accept a privacy policy to filter participant attributes
    usePublishState, // optional - BOOLEAN - don't add seeding information when not published
    scheduleAnalysis: {
      scheduledMinutesDifference // optional - scheduling conflicts determined by scheduledTime difference between matchUps
    },
    withDraws, // optional - defaults to true if any other context options are specified
    withEvents, // optional - defaults to true if any other context options are specified
    withIndividualParticipants, // optional - boolean or attributeFilter template - include hydrated individualParticiapnts for TEAM/PAIR participants
    withIOC, // optional - will add IOC country code and countryName to participant persons
    withISO2, // optional - will add ISO2 country code and countryName to participant persons
    withMatchUps, // optional - include all matchUps in which the participant appears, as well as potentialMatchUps
    withOpponents, // optional - include opponent participantIds
    withPotentialMatchUps, // optional boolean
    withRankingProfile, // optional boolean - include details necessary for point awards
    withScaleValues, // optional - include { ratings, rankings } attributes extracted from timeItems
    withSeeding, // optional - add event seeding
    withScheduleItems, // optional boolean - include array of scheduled matchUp details
    withSignInStatus, // optional boolean
    withStatistics, // optional - adds events, matchUps and statistics, e.g. 'winRatio'
    withTeamMatchUps // optional boolean
  });
```

## getLinkedTournamentIds

Returns `linkedTournamentIds` for each tournamentRecord loaded in `compeitionEngine`.

Caters for the possibility that, for instance, two "linked" tournaments and one "unlinked" tournament could be loaded.

```js
const { linkedTournamentIds } = engine.getLinkedTournamentIds();
/*
{
  'tournamentId-1': ['tournamentId-2', 'tournamentId-3'],
  'tournamentId-2': ['tournamentId-1', 'touranmentId-3'],
  'tournamentId-3': ['tournamentId-1', 'tournamentId-2']
}
*/
```

---

## getPositionsPlayedOff

Determines which finishing positions will be returned by a draw. For example, a First Match Loser Consolation with a draw size of 16 will playoff possitions 1, 2, 9 and 10.

```js
const { positionsPlayedOff } = engine.getPositionsPlayedOff({
  drawDefinition,
});
```

---

## getRounds

Returns all rounds of all `structures` in all `tournamentRecords`.

```js
const { rounds, excludedRounds } = engine.getRounds({
  excludeScheduleDateProfileRounds, // optional date string - exclude rounds which appear in schedulingProfile on given date
  excludeCompletedRounds, // optional boolean - exclude rounds where all matchUps are completed
  excludeScheduledRounds, // optional boolean - exclude rounds where all matchUps are scheduled
  inContextMatchUps, // optional - if not provided will be read from tournamentRecords
  schedulingProfile, // optional - if not provided will be read from tournamentRecords (where applicable)
  withSplitRounds, // optional boolean - read schedulingProfile and split rounds where defined
  matchUpFilters, // optional - filter competition matchUps before deriving rounds
  withRoundId, // optional boolean - return a unique id for each derived round
  scheduleDate, // optional - filters out events which are not valid on specified date
  venueId, // optional - filters out events which are not valid for specified venue
  context, // optional - object to be spread into derived rounds
});
```

Returns the following detail for each round:

```js
  {
    roundSegment: { segmentsCount, segmentNumber }, // if the round has been split in schedulingProfile
    winnerFinishingPositionRange,
    unscheduledCount,
    incompleteCount,
    minFinishingSum,
    matchUpsCount,
    stageSequence,
    segmentsCount, // when { withSplitRounds: true } and a round split is defined in schedulingProfile
    structureName,
    tournamentId,
    isScheduled, // whether every matchUp in the round has been scheduled (does not consider matchUpStatus: BYE)
    isComplete, // whether every matchUp in the round has been COMPLETED or ABANDONED/CANCELLED
    matchUpType,
    roundNumber,
    structureId,
    eventName,
    roundName,
    drawName,
    matchUps,
    byeCount
    eventId,
    drawId,
    id, // unique id provided when { withRoundId: true }
  } = round;
```

---

## getParticipantScaleItem

Return a ranking or rating or seeding value for a participant, referenced by participantId. See examples in [Get Specific Scale Item](../concepts/scaleItems.md#get-specific-scale-item), [Scale Item Values](../concepts/accessors.mdx#scale-item-values), [Complex Scale Item Retrieval](../concepts/accessors.mdx#complex-scale-item-retrieval).

See [Scale Items](../concepts/scaleItems).

```js
const scaleAttributes = {
  scaleType: RATING,
  eventType: SINGLES,
  scaleName: 'WTN',
  accessor, // optional - string determining how to access attribute if scaleValue is an object
};
const {
  scaleItem: { scaleValue },
  tournamentId,
} = engine.getParticipantScaleItem({
  scaleAttributes,
  participantId,
});
```

---

## getParticipantSchedules

```js
const { participantSchedules } = engine.getParticipantSchedules({
  participantFilters: { participantIds, participantTypes, eventIds },
});
```

---

## getParticipantSignInStatus

Participant signInStatus can be either 'SIGNED_IN' or 'SIGNED_OUT' (or undefined). See [modifyParticipantsSignInStatus](/docs/governors/participant-governor#modifyparticipantssigninstatus).

```js
const signInStatus = engine.getParticipantSignInStatus({
  participantId,
});
```

---

## getParticipantStats

```js
const result = engine.getParticipantStats({
  withCompetitiveProfiles, // optional boolean
  opponentParticipantId, // optional team opponent participantId, otherwise stats vs. all opponents
  withIndividualStats, // optional boolean
  teamParticipantId, // optional - when not provided all teams are processed
  tallyPolicy, // optional
  matchUps, // optional - specifiy or allow engine to get all
});

const {
  participatingTeamsCount, // only if no teamPartiicpantId has been specified
  allParticipantStats, // only if no teamParticipantId has been specified
  relevantMatchUps, // matchUps which were relevant to the calculations
  opponentStats, // only if opponentParticipantId has been provided
  teamStats, // only if teamParticipantId has been provided
  success, // when no error
  error, // if error
} = result;
```

---

## getPersonRequests

Returns an object with array of requests for each relevant `personId`. Request objects are returned with a `requestId` which can be used to call [modifyPersonRequests](/docs/governors/participant-governor#modifypersonrequests).

See [addPersonRequests](/docs/governors/participant-governor#addpersonrequests) for request object structure.

```js
const { personRequests } = engine.getPersonRequests({
  requestType, // optional filter
});
```

---

## getPolicyDefinitions

Finds policies which have been attached to the tournamentRecord, or to a target event, or target drawDefinition, in reverse order.
Once a matching `policyType` has been found, higher level policies of the same type are ignored, enabling a default policy to be attached to the tournamentRecord and for event-specific or draw-specific policies to override the default(s).

The constructed `policyDefinitions` object contains targeted policies from all levels, scoped to the lowest level specified.

See [Policies](../concepts/policies).

```js
const { policyDefinitions } = engine.getPolicyDefinitions({
  policyTypes: [POLICY_TYPE_SEEDING],
  eventId, // optional
  drawId, // optional
});
```

---

## getPositionAssignments

Returns an array of `positionAssignments` for a structure. Combines `positionAssginments` for child structures in the case of ROUND_ROBIN where `{ structureType: CONTAINER }`.

```js
let { positionAssignments } = engine.getPositionAssignments({
  structureId, // optional if { structure } is provided
  structure, // optional if { drawId, structureId } are provided
  drawId, // optional if { structure } is provided
});

const [{ drawPosition, participantId, qualifier, bye }] = positionAssignments;
```

---

## getPredictiveAccuracy

```js
const { accuracy, zoneDistribution } = engine.getPredictiveAccuracy({
  exclusionRule: { valueAccessor: 'confidence', range: [0, 70] }, // exclude low confidence values

  zoneMargin: 3, // optional - creates +/- range and report competitiveness distribution
  zonePct: 20, // optional - precedence over zoneMargin, defaults to 100% of rating range

  valueAccessor: 'wtnRating', // optional if `scaleName` is defined in factory `ratingsParameters`
  ascending: true, // optional - scale goes from low to high with low being the "best"
  scaleName: WTN,
});
```

---

## getRoundMatchUps

Organizes matchUps by roundNumber. **roundMatchUps** contains matchUp objects; **roundProfile** provides an overview of drawPositions which have advanced to each round, a matchUpsCount, finishingPositionRange for winners and losers, and finishingRound.

```js
const { roundMatchUps, roundProfile } = engine.getRoundMatchUps({
  matchUps,
});
```

---

## getScaledEntries

Retrieves event entries sorted by their scale values (ratings, rankings, etc.). This method is useful for generating seeding when standard sorting by a scale value is sufficient. See examples: [Using Factory getScaledEntries()](../concepts/scaleItems.md#using-factory-getscaledentries).

**Purpose:**

- Sort participants by rating/ranking values
- Prepare entries for seeding generation
- Filter and order entries for draw placement

**Use Cases:**

- **Simple Seeding** - When seed order directly follows rating/ranking values
- **Pre-Processing** - Before applying custom sorting logic
- **Validation** - Checking participant ratings before seeding

See [Scale Items](../concepts/scaleItems) and [Generating Seeding Scale Items](../concepts/scaleItems#generating-seeding-scale-items).

```js
const { scaledEntries } = engine.getScaledEntries({
  // Entry Source (choose one)
  eventId, // optional - uses event.entries filtered by stage
  entries, // optional - provide custom array of entries (overrides eventId)

  // Filters
  stage, // optional - 'MAIN', 'QUALIFYING', 'CONSOLATION' - filter entries by stage

  // Scale Configuration
  scaleAttributes, // required - { scaleType, scaleName, eventType, accessor? }

  // Sorting Options
  scaleSortMethod, // optional - function(a, b) {} - custom sort comparator
  sortDescending, // optional - boolean - default is ASCENDING
});
```

### getScaledEntries Parameters

**eventId** - _string_ (optional)

- Event from which to retrieve entries
- Mutually exclusive with `entries` parameter
- When provided, uses `event.entries` as source

**entries** - _array_ (optional)

- Custom array of entry objects
- Overrides `eventId` if both provided
- Must include `participantId` for each entry

**stage** - _string_ (optional)

- Filter entries by stage: `'MAIN'`, `'QUALIFYING'`, `'CONSOLATION'`
- Only applies when using `eventId`
- Returns only entries matching the specified stage

**scaleAttributes** - _object_ (required)

- Defines which scale to use for sorting
- **scaleType**: `'RATING'`, `'RANKING'`, or `'SEEDING'`
- **scaleName**: Identifier (e.g., `'WTN'`, `'UTR'`, `'ATP'`)
- **eventType**: `'SINGLES'`, `'DOUBLES'`, or `'TEAM'`
- **accessor** (optional): Path to nested value if `scaleValue` is an object

**scaleSortMethod** - _function_ (optional)

- Custom comparator function: `(a, b) => number`
- Receives two scale values for comparison
- Return negative/zero/positive like standard sort
- Useful when `scaleValue` is an object or custom logic needed

**sortDescending** - _boolean_ (optional)

- `true`: Sort from highest to lowest (largest value first)
- `false`: Sort from lowest to highest (smallest value first)
- Default is `false` (ascending order)
- Only applies to default sorting (not `scaleSortMethod`)

### getScaledEntries Return Value

```js
{
  scaledEntries; // array of entries sorted by scale values
}
```

**scaledEntries** - Array of entry objects, each containing:

- Original entry attributes
- Participant scale information
- Sorted by scale value according to parameters

### Examples

#### Basic Usage - Sort by Rating

```js
// Get entries sorted by WTN rating (ascending)
const { scaledEntries } = tournamentEngine.getScaledEntries({
  eventId: 'singles-main',
  scaleAttributes: {
    scaleType: 'RATING',
    scaleName: 'WTN',
    eventType: 'SINGLES',
  },
});

// scaledEntries[0] has lowest WTN rating
// scaledEntries[last] has highest WTN rating
```

#### Sort by Ranking (Descending)

```js
// Get entries sorted by ATP ranking (highest rank first)
const { scaledEntries } = tournamentEngine.getScaledEntries({
  eventId: 'singles-main',
  scaleAttributes: {
    scaleType: 'RANKING',
    scaleName: 'ATP',
    eventType: 'SINGLES',
  },
  sortDescending: true, // highest ranking first
});

// scaledEntries[0] has best (lowest number) ATP ranking
```

#### Filter by Stage

```js
// Get only qualifying entries sorted by rating
const { scaledEntries } = tournamentEngine.getScaledEntries({
  eventId: 'singles-event',
  stage: 'QUALIFYING',
  scaleAttributes: {
    scaleType: 'RATING',
    scaleName: 'UTR',
    eventType: 'SINGLES',
  },
});
```

#### Custom Entries Array

```js
// Sort custom set of participants
const myEntries = [
  { participantId: 'p1', entryStage: 'MAIN', entryStatus: 'DIRECT_ACCEPTANCE' },
  { participantId: 'p2', entryStage: 'MAIN', entryStatus: 'DIRECT_ACCEPTANCE' },
  { participantId: 'p3', entryStage: 'MAIN', entryStatus: 'WILDCARD' },
];

const { scaledEntries } = tournamentEngine.getScaledEntries({
  entries: myEntries, // Use custom array instead of event entries
  scaleAttributes: {
    scaleType: 'RATING',
    scaleName: 'WTN',
    eventType: 'SINGLES',
  },
});
```

#### Complex Scale Values with Accessor

```js
// When scaleValue is an object, use accessor to specify comparison value
const { scaledEntries } = tournamentEngine.getScaledEntries({
  eventId: 'singles-main',
  scaleAttributes: {
    scaleType: 'RATING',
    scaleName: 'NTRP',
    eventType: 'SINGLES',
    accessor: 'ntrpRating', // Extract this property from scaleValue object
  },
});

// Participants have scale items like:
// scaleValue: { ntrpRating: 4.5, ratingYear: '2024', ustaRatingType: 'C' }
// Accessor 'ntrpRating' tells method to sort by the 4.5 value
```

#### Custom Sort Method

```js
// Custom sorting logic for complex cases
const { scaledEntries } = tournamentEngine.getScaledEntries({
  eventId: 'singles-main',
  scaleAttributes: {
    scaleType: 'RATING',
    scaleName: 'WTN',
    eventType: 'SINGLES',
  },
  scaleSortMethod: (a, b) => {
    // Custom logic: prioritize by confidence, then by rating
    const confidenceDiff = (b.confidence || 0) - (a.confidence || 0);
    if (confidenceDiff !== 0) return confidenceDiff;
    return a.rating - b.rating; // Ascending rating
  },
});
```

### Common Workflows

#### Generating Seeding from Scaled Entries

```js
// Step 1: Get scaled entries
const { scaledEntries } = tournamentEngine.getScaledEntries({
  eventId: 'singles-main',
  stage: 'MAIN',
  scaleAttributes: {
    scaleType: 'RATING',
    scaleName: 'WTN',
    eventType: 'SINGLES',
  },
  sortDescending: true, // Highest rating first
});

// Step 2: Get seeds count
const { seedsCount } = tournamentEngine.getEntriesAndSeedsCount({
  policyDefinitions: POLICY_SEEDING,
  eventId: 'singles-main',
  stage: 'MAIN',
});

// Step 3: Take top entries
const topEntries = scaledEntries.slice(0, seedsCount);

// Step 4: Generate seeding scale items
const { scaleItemsWithParticipantIds } = tournamentEngine.generateSeedingScaleItems({
  scaleAttributes: {
    scaleType: 'SEEDING',
    scaleName: 'singles-main',
    eventType: 'SINGLES',
  },
  scaledEntries: topEntries,
  seedsCount,
  scaleName: 'singles-main',
});

// Step 5: Save to participants
scaleItemsWithParticipantIds.forEach(({ participantId, scaleItems }) => {
  tournamentEngine.setParticipantScaleItems({ participantId, scaleItems });
});
```

#### Validating Rating Coverage

```js
// Check how many entries have ratings
const { scaledEntries } = tournamentEngine.getScaledEntries({
  eventId: 'singles-main',
  scaleAttributes: {
    scaleType: 'RATING',
    scaleName: 'WTN',
    eventType: 'SINGLES',
  },
});

const totalEntries = scaledEntries.length;
const ratedEntries = scaledEntries.filter((entry) => entry.scaleValue).length;
const ratingCoverage = (ratedEntries / totalEntries) * 100;

console.log(`${ratingCoverage.toFixed(1)}% of entries have WTN ratings`);
```

### Notes

**Missing Scale Values:**

- Entries without matching scale items are included but placed at the end
- Their order among unrated entries is undefined
- Consider filtering these out before generating seeding

**Performance:**

- Method retrieves scale items for all entries
- More efficient than manually querying each participant
- Results are suitable for immediate use in seeding generation

**Comparison with autoSeeding():**

- `getScaledEntries()` only sorts entries; doesn't assign seeds
- Allows inspection/modification before generating seeds
- More control over seeding process
- `autoSeeding()` combines sorting and assignment in one call

### See Also

- **[Scale Items](../concepts/scaleItems)** - Complete scale items documentation
- **[Generating Seeding Scale Items](../concepts/scaleItems#generating-seeding-scale-items)** - Seeding generation patterns
- **[Auto Seeding](/docs/governors/draws-governor#autoseeding)** - Automatic seeding
- **[generateSeedingScaleItems](/docs/governors/generation-governor#generateseedingscaleitems)** - Generate seed assignments

---

## getSchedulingProfile

Returns a `schedulingProfile` (if present). Checks the integrity of the profile to account for any `venues` or `drawDefinitions` which have been deleted.

```js
const { schedulingProfile } = engine.getSchedulingProfile();
```

---

## getSchedulingProfileIssues

Analyzes the `schedulingProfile` (if any) that is attached to the `tournamentRecord(s)` and reports any issues with the ordering of rounds.

The analysis for each `scheduleDate` only includes `matchUps` to be scheduled on that date.
In other words, the method only reports on scheduling issues relative to the group of `matchUpIds` derived from rounds which are being scheduled for each date.

:::note
In some cases it is valid to schedule a second round, for instance, before a first round, because there may be some second round `matchUps` which are ready to be played... possibly due to `participants` advancing via first round BYEs or WALKOVERs.

Regardless of issues reported, `engine.scheduleProfileRounds()` will attempt to follow the desired order, but will not schedule `matchUps` before dependencies.
:::

```js
const {
  profileIssues: {
    // object includes matchUpIds which are out of order
    matchUpIdsShouldBeAfter: {
      [matchUpId]: {
        earlierRoundIndices: [index], // indices of scheduled rounds which must be scheduled before matchUpId
        shouldBeAfter: [matchUpId], // array of matchUpIds which must be scheduled before matchUpId
      },
    },
  },
  // roundIndex is the index of the round to be scheduled within the schedulingProfile for a givn date
  roundIndexShouldBeAfter: {
    [scheduleDate]: {
      [index]: [indexOfEarlierRound], // maps the index of the round within a date's scheduled rounds to those rounds which should be scheduled first
    },
  },
} = engine.getSchedulingProfileIssues({
  dates, // optional array of target dates
});
```

---

## getSeedsCount

Takes a policyDefinition, drawSize and participantsCount and returrns the number of seeds valid for the specified drawSize

:::note
`drawSizeProgression` will be overridden by a `{ drawSizeProgression }` value in a policyDefinition.
:::

```js
const { seedsCount, error } = engine.getSeedsCount({
  drawSizeProgression, // optional - fits the seedsCount to the participantsCount rather than the drawSize
  policyDefinitions: SEEDING_USTA,
  participantsCount: 15,
  drawSize: 128,
});
```

---

## getSeedingThresholds

```js
const { seedingThresholds } = engine.getSeedingThresholds({
  roundRobinGroupsCount,
  participantsCount,
});
```

---

## getStructureSeedAssignments

Returns seedAssignments for a specific structure based on structureId or structure

The structure of an **_assignment object_** is as follows:

```json
{
  "seedNumber": 1,
  "seedValue": "1",
  "participantId": "uuid-of-participant"
}
```

The most basic usage is to retrieve seed assignments for a draw which has a single main stage structure

```js
const { seedAssignments } = engine.getStructureSeedAssignments({
  structureId,
  drawId,
});
```

---

## getStructureReports

Returns details of all structures within a tournamentRecord, as well as aggregated details per event.

`tournamentId, eventId, structureId, drawId, eventType, category: subType, categoryName, ageCategoryCode, flightNumber, drawType, stage, winningPersonId, winningPersonWTNrating, winningPersonWTNconfidence, winningPerson2Id, winningPerson2WTNrating, winningPerson2WTNconfidence, positionManipulations, pctNoRating, matchUpFormat, pctInitialMatchUpFormat, matchUpsCount, tieFormatDesc, tieFormatName, avgConfidence, avgWTN`

```js
const {
  structureReports,
  eventStructureReports: {
    totalPositionManipulations,
    maxPositionManipulations,
    generatedDrawsCount,
    drawDeletionsCount,
  },
} = engine.getStructureReports({
  firstStageSequenceOnly, // boolean - defaults to true - only return first stageSequence
  firstFlightOnly, // boolean - defaults to true - only return first flight when multiple drawDefinitions per event
  extensionProfiles: [
    {
      name, // extension name
      label, // label for generated attribute
      accessor, // dot-notation accessor for extension value, e.g. 'attribute.attribute'
    },
  ],
});
```

To export report as CSV:

```js
const csv = tools.JSON2CSV(structureReports);
```

---

## getTeamLineUp

```js
const { lineUp } = engine.getTeamLineUp({ drawId, participantId });
```

---

## getTieFormat

Returns `tieFormat` definition objects for specified context(s).

`tieFormat` for each matchUp is determined by traversing the hierarchy: `matchUp => stucture => drawDefinition => event`

```js
const { tieFormat, structureDefaultTieFormat, drawDefaultTieFormat, eventDefaultTieFormat } = engine.getTieFormat({
  structureId,
  matchUpId,
  eventId,
  drawId,
});
```

---

## compareTieFormats

Compares two tie format definitions and returns details about their differences, including added/removed/modified collections and value changes.

```js
const {
  different, // boolean — whether the formats differ
  invalid, // boolean — whether comparison could not be performed
  modifications, // array of modification descriptions
} = queryGovernor.compareTieFormats({
  ancestor, // required — the original tieFormat object
  descendant, // required — the modified tieFormat object
});
```

---

## getTournament

Returns the current tournament record from the engine state. This is a convenience alias — equivalent to accessing the tournament record via `getState()`.

```js
const { tournamentRecord } = engine.getTournament();
```

---

## getTournamentInfo

Returns tournament attributes. Used to attach details to publishing payload by `getEventData`.

```js
const { tournamentInfo } = getTournamentInfo({ tournamentRecord });
const {
  tournamentId,
  tournamentRank,

  formalName,
  tournamentName,
  promotionalName,
  onlineResources,

  localTimeZone,
  startDate,
  endDate,

  hostCountryCode,
  tournamentStatus,
} = tournamentInfo;
```

---

## getTournamentPersons

Returns **deepCopies** of persons extracted from tournament participants. Each person includes an array of `participantIds` from which person data was retrieved.

```js
const { tournamentPersons } = engine.getTournamentPersons({
  participantFilters: { participantRoles: [COMPETITOR] }, // optional - filters
});
```

---

## getTournamentPenalties

Returns an array of all penalties issued during a tournament.

```js
const { penalties } = engine.getTournamentPenalties();
```

---

## getTournamentStructures

```js
const { structures, stageStructures } = engine.getTournamentStructures({
  withStageGrouping: true, // optional return structures grouped by stages
  stageSequences, // optional - specify stageSequences to include
  stageSequence, // optional - filter by stageSequence
  stages, // optional - specify stageSequences to include
  stage, // optional - filter by stage
});
```

---

## getValidGroupSizes

Returns valid Round Robin group sizes for specified `drawSize`.

```js
const { validGroupSizes } = engine.getValidGroupSizes({
  groupSizeLimit, // optional - defaults to 10
  drawSize,
});
```

---

## getVenuesAndCourts

Returns an array of all Venues which are part of a tournamentRecord and an aggregation of courts across all venues.

```js
const { venues, courts } = engine.getVenuesAndCourts({
  convertExtensions, // optional boolean
  ignoreDisabled, // optional boolean
  dates, // optional - used with ignoreDisabled - applies to courts
});
```

---

## getVenueData

Returns restricted venue attributes along with information for all associated courts. Used primarily by `getEventData` to return a subset of venue/courts information for publishing purposes.

```js
const {
  venueName,
  venueAbbreviation,
  courtsInfo, // array of courts and associated attributes
} = engine.getVenueData({ venueId });
```

---

## generateBookings

This methods is used internally for creating a "virtual" view of court availability.

```js
const { bookings, relevantMatchUps } = engine.generateBookings({
  defaultRecoveryMinutes, // optional
  averageMatchUpMinutes, // optional
  periodLength, // optional - scheduling period in minutes
  scheduleDate, // optional - only consider matchUps scheduled on scheduleDate
  venueIds, // optional - only consider matchUps at specific venue(s)
  matchUps,
});
```

---

## getVenuesReport

Returns a `venueReports` array which provides details for each targt `venue` for targt date(s).

```js
const { venuesReport } = engine.getVenuesReport({
  dates, // optional array of target dates
  venueIds, // optional array of target venueIds
  ignoreDisabled, // optional boolean, defaults to true - ignore disabled venues/courts
});

const {
  availableCourts, // how many courts are available for date
  availableMinutes, // total courts minutes available for date
  scheduledMinutes, // minutes of court time that are scheduled for matchUps
  scheduledMatchUpsCount, // number of scheduled matchUps
  percentUtilization, // percent of available minutes utilized by scheduled matchUps
} = venuesReport[0].venueReport[date];
```

---

## isCompletedStructure

Returns boolean whether all matchUps in a given structure have been completed

```js
const structureIsComplete = engine.isCompletedStructure({
  structureId,
});
```

---

## isValidForQualifying

Provides determination of whether qualifying structure(s) may be added to the structure specified by `structureId`.

```js
const { valid } = engine.isValidForQualifying({
  structureId,
  drawId,
});
```

---

## isValidMatchUpFormat

Returns boolean indicating whether matchUpFormat code is valid.

```js
const valid = engine.isValidMatchUpFormat({ matchUpFormat });
```

---

## matchUpActions

Return an array of all validActions for a specific matchUp. See examples: [Usage](../concepts/actions.mdx#usage), [MatchUp Actions](../concepts/matchup-overview.md#matchup-actions).

```js
const {
  isByeMatchUp, // boolean; true if matchUp includes a BYE
  structureIsComplete, // boolean; true if structure is ready for positioning
  validActions, // array of possible actions given current matchUpStatus
} = engine.matchUpActions({
  restrictAdHocRoundParticipants, // optional - true by default; applies to AD_HOC; disallow the same participant being in the same round multiple times
  sideNumber, // optional - select side to which action should apply; applies to AD_HOC position assignments
  matchUpId, // required - reference to targeted matchUp
  drawId, // optional - not strictly required; method will find matchUp by brute force without it
});

const {
  type, // 'REFEREE', 'SCHEDULE', 'PENALTY', 'STATUS', 'SCORE', 'START', 'END', 'SUBSTITUTION'.
  method, // engine method relating to action type
  payload, // attributes to be passed to method
  // additional method-specific options for values to be added to payload when calling method
} = validAction;
```

---

## participantScaleItem

Similar to [getParticipantScaleItem](#getparticipantscaleitem) but takes a `participant` object and doesn't require `engine.setState(tournamentRecord)`.

See [Scale Items](../concepts/scaleItems).

```js
const scaleAttributes = {
  scaleType: RATING,
  eventType: SINGLES,
  scaleName: 'WTN',
  accessor, // optional - string determining how to access attribute if scaleValue is an object
};
const {
  scaleItem: { scaleValue },
} = engine.participantScaleItem({
  scaleAttributes,
  participant,
});
```

---

## positionActions

Returns valid actions for a given `drawPosition`. If params includes `matchUpId` will pass through to [matchUpActions](#matchupactions) when called for **AD_HOC** structures. See examples: [Usage](../concepts/actions.mdx#usage).

```js
const positionActions = engine.positionActions({
  policyDefinitions: positionActionsPolicy, // optional - policy defining what actions are allowed in client context
  returnParticipants, // optional boolean; defaults to true; performance optimization when false requires client to provide participants.
  drawPosition,
  structureId,
  drawId,
});

const {
  isActiveDrawPosition, // boolean
  isByePosition, // boolean
  isDrawPosition, // boolean
  hasPositionAssiged, // boolean
  validActions,
} = positionActions;

const {
  type, // 'ASSIGN', 'LUCKY', 'SWAP', 'BYE', 'REMOVE'
  method, // engine method relating to action type
  payload, // attributes to be passed to method
  // additional method-specific options for values to be added to payload when calling method
} = validAction;
```

---

## tallyParticipantResults

Generates participant results and groupOrder for round robin structures. Calculates standings based on win/loss records, sets, games, points, and applies tiebreaking directives from the round robin tally policy.

### Basic Usage

```js
const { participantResults, order, bracketComplete, report, readableReport } = tallyParticipantResults({
  policyDefinitions, // Optional - policy with roundRobinTally configuration
  matchUps, // Required - array of round robin matchUps
  matchUpFormat, // Optional - default format for the structure
  perPlayer, // Optional - expected matchUps per participant
  subOrderMap, // Optional - sub-order mapping for playoff placement
  pressureRating, // Optional - calculate pressure ratings
  generateReport: false, // Optional - generate detailed tiebreaking report
});
```

### Return Values

**participantResults** - Object keyed by participantId with statistics and placement

**order** - Array of participants in final/provisional order with resolution status

**bracketComplete** - Boolean indicating if all matchUps are complete

**report** - Array of tiebreaking steps (when generateReport: true)

**readableReport** - Human-readable tiebreaking explanation (when generateReport: true)

### The generateReport Parameter

When `generateReport: true`, returns detailed information about **exactly how tiebreaks were resolved**:

**Why use it?**

- **Transparency** - Show participants how their placement was determined
- **Debugging** - Understand why specific tiebreaking directives were used
- **Validation** - Verify that tiebreaking followed the expected policy
- **Documentation** - Record the complete tiebreaking process

**What's included?**

For each tiebreaking step:

1. Which directive was applied (e.g., `matchUpsPct`, `headToHead.setsPct`)
2. How participants grouped by that directive's values
3. Whether the directive used idsFilter (head-to-head for tied participants only)
4. Whether maxParticipants excluded the directive (skipping 3+ way ties)
5. Which participants remained tied after the directive
6. Final order with resolution status

**Example readableReport output:**

```text
Step 1: 4 participants were grouped by matchUpsPct
0.75 matchUpsPct: Player A, Player B
0.50 matchUpsPct: Player C
0.25 matchUpsPct: Player D
----------------------
Step 2: 2 participants were separated by headToHead.matchUpsPct
headToHead.matchUpsPct was calculated considering ONLY TIED PARTICIPANTS
1.00 headToHead.matchUpsPct: Player A
0.00 headToHead.matchUpsPct: Player B
----------------------
Final Order:
1: Player A => resolved: true
2: Player B => resolved: true
3: Player C => resolved: true
4: Player D => resolved: true
```

**Example usage:**

```js
const { participantResults, order, report, readableReport } = tallyParticipantResults({
  matchUps: roundRobinMatchUps,
  policyDefinitions: {
    roundRobinTally: {
      tallyDirectives: [
        { attribute: 'matchUpsPct' },
        { attribute: 'headToHead.matchUpsPct', idsFilter: true, maxParticipants: 2 },
        { attribute: 'headToHead.setsPct', idsFilter: true, maxParticipants: 2 },
        { attribute: 'setsPct' },
      ],
    },
  },
  generateReport: true,
});

// Display human-readable report
console.log(readableReport);

// Analyze programmatically
report.forEach((step) => {
  console.log(`${step.attribute}: ${step.participantIds.length} still tied`);
  if (step.idsFilter) console.log('  → Head-to-head calculation');
  if (step.excludedDirectives) console.log('  → Some directives skipped (maxParticipants)');
});
```

:::tip Development Context
Setting `engine.devContext({ tally: true })` will automatically log `readableReport` to the console during calculation, even when `generateReport: false`.

In browser consoles of client applications use: `dev.context({ tally: true })` where available.
:::

### Further Reading

- **[Round Robin Tally Policy](../policies/roundRobinTallyPolicy.md)** - Complete policy documentation
- **[tallyDirectives](../policies/roundRobinTallyPolicy.md#tallydirectives)** - Configure tiebreaking order
- **[idsFilter](../policies/roundRobinTallyPolicy.md#idsfilter)** - Head-to-head calculations
- **[maxParticipants](../policies/maxParticipants.md)** - Participant count thresholds

---

## tournamentMatchUps

Returns tournament matchUps grouped by matchUpStatus. These matchUps are returned with _context_.

```js
const {
  abandonedMatchUps,
  completedMatchUps,
  upcomingMatchUps,
  pendingMatchUps,
  byeMatchUps,
  groupInfo,
  participants,
} = engine.tournamentMatchUps({
  scheduleVisibilityFilters, // { visibilityThreshold: dateString, eventIds, drawIds }
  policyDefinitions, // optional - seeding or avoidance policies to be used when placing participants
  matchUpFilters, // optional; [ scheduledDates: [], courtIds: [], stages: [], roundNumbers: [], matchUpStatuses: [], matchUpFormats: []]
});
```

---

## findExtension

Finds and returns a specific extension by name from a tournament element (tournament, event, draw, participant, matchUp, etc.). See examples: [Retrieving Scheduling Profile](../concepts/scheduling-profile.mdx#retrieving-scheduling-profile).

```js
const { extension, info } = engine.findExtension({
  name: 'privateNote', // extension name to find
  element: tournamentRecord, // object containing extensions array
  discover: true, // optional - search in params for extension
});

if (extension) {
  console.log(extension.value);
}
```

**Parameters:**

```ts
{
  name: string;                    // required - extension name
  element?: any;                   // object with extensions array
  discover?: boolean | string[];   // search params for extension
  ...params                        // additional objects to search (if discover is true)
}
```

**Returns:**

```ts
{
  extension?: Extension;
  info?: string;  // NOT_FOUND if extension doesn't exist
  error?: ErrorType;  // MISSING_VALUE if name or element missing
}
```

**Notes:**

- Returns first matching extension by name
- If `discover` is `true`, searches all params for objects with extensions
- If `discover` is `string[]`, only searches specified param keys
- Useful for finding custom extensions without knowing exact location

---

## credits

Returns an acknowledgments string recognizing contributors to the CourtHive/CODES project.

```js
const acknowledgments = engine.credits();
console.log(acknowledgments);
```

**Returns:** `string` - Multi-line acknowledgments text

**Note:** This method provides attribution and thanks to the many people who contributed to the development of the tournament management system and CODES standards.

---
