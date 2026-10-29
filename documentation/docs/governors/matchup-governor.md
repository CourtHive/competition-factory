---
title: matchUp Governor
---

:::warning Governor API transition at 8.0.0

Some methods on this page are candidates for removal from production engine exports at the 8.0.0 boundary. Their implementation references have moved: [`getMatchUpContextIds`](/docs/implementation/records/getMatchUpContextIds), [`getMatchUpType`](/docs/implementation/records/getMatchUpType), [`participantScheduledMatchUps`](/docs/implementation/records/participantScheduledMatchUps), [`validMatchUp`](/docs/implementation/validation/validMatchUp), [`validMatchUps`](/docs/implementation/validation/validMatchUps). Existing 7.x routes remain available; final decisions and external-integrator confirmations are tracked in the [transition index](/docs/implementation/engine-api-transition-8).

:::

```js
import { matchUpGovernor } from 'tods-competition-factory';
```

## abandonTournamentMatchUps

Bulk "end the tournament": sets every still-playable matchUp to `ABANDONED`. Intended for tournaments whose draws cannot be completed (for example, rain) — rather than leaving unplayed matchUps as `TO_BE_PLAYED`, a director marks them `ABANDONED` in a single call.

Selection is driven by the derived `readyToScore` state: a matchUp with assigned participants on **both** sides, no `winningSide`, and an active structure. As a result BYEs, already-decided matchUps (`COMPLETED`, `WALKOVER`, `RETIRED`, …), already-terminal matchUps (`ABANDONED`, `CANCELLED`), and empty downstream rounds (no participants yet) are never touched. `ABANDONED` is a non-directing status, so no participant is advanced.

This mutates matchUps only — it does **not** change event or tournament status. TEAM container matchUps and tie collection matchUps are out of scope.

```js
const { abandoned, matchUpIds } = engine.abandonTournamentMatchUps({
  eventIds, // optional - restrict to these events
  drawIds, // optional - restrict to these draws
  requireNoScore, // optional - default true; when true, in-progress matchUps that already
  // have a partial score are left untouched. Set false to also abandon
  // started-but-unfinished matchUps.
});
// abandoned: number of matchUps set to ABANDONED
// matchUpIds: ids of the matchUps that were abandoned
```

---

## allCompetitionMatchUps

Returns all matchUps from all tournaments in a competition. See examples in [Using proConflicts() for Analysis](../concepts/pro-scheduling.md#using-proconflicts-for-analysis).

```js
const { matchUps } = engine.allCompetitionMatchUps({
  tournamentRecords, // required - array of tournament records
});
```

---

## allDrawMatchUps

Returns all matchUps from a specific draw.

```js
const { matchUps } = engine.allDrawMatchUps({
  drawId, // required
});
```

---

## allEventMatchUps

Returns all matchUps from a specific event.

```js
const { matchUps } = engine.allEventMatchUps({
  eventId, // required
});
```

---

## allTournamentMatchUps

Returns all matchUps from a tournament.

```js
const { matchUps } = engine.allTournamentMatchUps();
```

---

## analyzeMatchUp

Analyzes a matchUp to extract detailed information.

```js
const { analysis } = engine.analyzeMatchUp({
  matchUp, // required
});
```

For an aggregate `matchUpFormat` (the match-level `A` modifier) the winner is the side with more
points across every set, not the side that won more sets, and the totals are returned as
`aggregateScores`. Every set the format plays must be recorded. Equal totals give no
`calculatedWinningSide`: a decider is owed.

```js
// SET2XA-S:T10 with sets 22-21 and 15-19
// aggregateScores: [37, 40], calculatedWinningSide: 2
```

---

## applyLineUps

Applies `lineUps` to the `sides` of a _TEAM_ matchUp. Order is not important as team side is determined automatically, from the roster members in each lineUp. A lineUp may include players who are on no team; it may not include a player of another team.

**One player, one team, per event.** A player who belongs to another team of the event (on its roster, or in its
lineUp in any of the event's draws) is refused with `SHARED_INDIVIDUAL_PARTICIPANT`, and `context` names the player
and that team. A player who belongs to no team may be placed: the result is a success with a `NOT_ON_TEAM_ROSTER`
warning (`warnings: [{ code: 'NOT_ON_TEAM_ROSTER', info: { participantIds } }]`), and from then on the player belongs
to that team for the rest of the event.

```js
result = engine.applyLineUps({
  matchUpId, // must be { matchUpType: TEAM }
  lineUps, // array of at most two lineUps (see CODES)
  drawId, // reference to draw in which matchUp occurs
});
```

---

## assignMatchUpSideParticipant

Assign participant to AD_HOC matchUp.

Refused with `SHARED_INDIVIDUAL_PARTICIPANT` when the participant shares an individual with the opposing side, and with `EXISTING_ROUND_PARTICIPANT` when the participant — or a PAIR/TEAM sharing one of its individuals — already plays in another matchUp of the same round.

```js
engine.assignMatchUpSideParticipant({
  participantId,
  sideNumber,
  matchUpId,
  drawId,
});
```

---

## assignTieMatchUpParticipantId

Used when interactively assigning participants to `matchUps`. When individual `participantIds` are assigned to `{ matchUpType: 'DOUBLES' }` it handles creating `{ participantType: PAIR }` participants dynamically. See examples: [Creating Pairs Automatically](../concepts/participants.md#creating-pairs-automatically).

```js
engine.assignTieMatchUpParticipantId({
  teamParticipantId, // optional - participant team can be derived from participantId; required for a player on no team
  participantId, // id of INDIVIDUAL or PAIR participant to be assigned to a matchUp
  tieMatchUpId, // matchUpId of a SINGLES or DOUBLES that is part of a matchUp between teams
  sideNumber, // optional - only necessary if a participant is part of both teams (edge case!)
  drawId, // identifies draw in which matchUp is present
});
```

Refused with `INVALID_MATCHUP` when `tieMatchUpId` names a SINGLES or DOUBLES matchUp that is not a line of a TEAM matchUp (7.8.0; before, the refusal named an unrelated cause: team not found, not found, or missing matchUp). A TEAM matchUp itself is refused the same way.

**One player, one team, per event.** A player who belongs to another team of the event (on its roster, or in its
lineUp in any of the event's draws) is refused with `SHARED_INDIVIDUAL_PARTICIPANT`, and `context` names the player
and that team. A player who belongs to no team may be placed: the result is a success with a `NOT_ON_TEAM_ROSTER`
warning (`warnings: [{ code: 'NOT_ON_TEAM_ROSTER', info: { participantIds } }]`), and from then on the player belongs
to that team for the rest of the event.

---

## bulkMatchUpStatusUpdate

Provides the ability to update the outcomes of multiple matchUps at once. Each outcome is applied with [setMatchUpStatus](#setmatchupstatus), and a result entered in bulk propagates exactly as the same result entered singly.

```js
const outcomes = [
  {
    tournamentId, // required
    eventId, // required
    drawId, // required — a draw of that event
    matchUpId, // required
    matchUpFormat, // optional
    matchUpStatus,
    winningSide,
    score,
    schedule, // optional
    notes, // optional
    // optional — any option below, for this outcome only
  },
];
engine.bulkMatchUpStatusUpdate({
  outcomes,
  policyDefinitions, // optional
  // optional — applied to every outcome; one set on an outcome wins over the same one set here
  allowChangePropagation,
  propagateExitStatus,
  propagateRetirementAsExit,
  disableScoreValidation,
  disableAutoCalc,
  enableAutoCalc,
  setTBlast,
});
```

The options mean what they mean on `setMatchUpStatus`, with the same precedence for the three propagation flags: an applied scoring policy that speaks on a flag wins over the call, and the call decides only where the policy is silent.

Every outcome is located before any is applied: its tournament, event, draw (which must belong to that event) and matchUp. If one is missing or not found, the call is refused and nothing is written. The error names what is missing (`MISSING_TOURNAMENT_RECORD`, `MISSING_EVENT`, `EVENT_NOT_FOUND`, `MISSING_DRAW_ID`, `DRAW_DEFINITION_NOT_FOUND`, `MISSING_MATCHUP_ID` or `MATCHUP_NOT_FOUND`), and `context.outcomeIndex` says which outcome. Outcomes are then applied in the order given. If `setMatchUpStatus` refuses one of them, the call returns that error and the outcomes before it stay written; pass `rollbackOnError: true` to make the whole call all or nothing.

---

## checkInParticipant

Set the check-in state for a participant. Used to determine when both participants in a matchUp are available to be assigned to a court. See examples: [Sign-In Management](../concepts/participants.md#sign-in-management), [Participant Check-In](../concepts/matchup-overview.md#participant-check-in).

```js
engine.checkInParticipant({
  participantId,
  matchUpId,
  drawId,
});
```

---

## checkOutParticipant

```js
engine.checkOutParticipant({
  participantId,
  matchUpId,
  drawId,
});. See examples: [Sign-In Management](../concepts/participants.md#sign-in-management).
```

---

## calculateWinCriteria

Calculates the win criteria for a matchUp based on format.

```js
const { criteria } = engine.calculateWinCriteria({
  matchUpFormat, // required
});
```

---

## checkMatchUpIsComplete

Checks if a matchUp has a winning side.

```js
const { isComplete } = engine.checkMatchUpIsComplete({
  matchUp, // required
});
```

---

## competitionScheduleMatchUps

Returns scheduled matchUps across all tournaments in a competition, with support for publish-state filtering and embargo enforcement. See examples: [Querying Published Schedules](../concepts/publishing/publishing-order-of-play.md#querying-published-schedules).

```js
const {
  completedMatchUps, // completed matchUps (for the filtered date when not using alwaysReturnCompleted)
  mappedParticipants, // { [participantId]: participant } - returned when hydrateParticipants is false
  dateMatchUps, // all incomplete matchUps for the filtered date(s)
  courtPrefix, // court prefix string (returned when withCourtGridRows is true)
  courtsData, // array of court objects, each with a matchUps array
  groupInfo, // group/round-robin information
  venues, // venue data
  rows, // court grid rows (returned when withCourtGridRows is true)
} = engine.competitionScheduleMatchUps({
  courtCompletedMatchUps, // boolean - include completed matchUps in court.matchUps; useful for pro-scheduling
  alwaysReturnCompleted, // boolean - return completed matchUps regardless of publish state
  activeTournamentId, // optional string - target a specific tournament in multi-tournament competitions
  hydrateParticipants, // boolean - defaults to true; when false, sides contain participantId and context-specific attributes only
  participantsProfile, // optional - specify additions to context (see getParticipants())
  policyDefinitions, // optional - e.g. privacy policies
  withCourtGridRows, // optional boolean - return { rows } of matchUps for courts laid out as a grid, with empty cells
  minCourtGridRows, // optional integer - minimum number of rows to return
  sortDateMatchUps, // boolean - optional - defaults to true
  usePublishState, // boolean - filter by publish state: published eventIds, scheduledDates, and embargo timestamps
  contextFilters, // optional - filters based on context attributes (e.g. drawIds)
  matchUpFilters, // optional - { scheduledDate, scheduledDates[], courtIds[], stages[], roundNumbers[], matchUpStatuses[], matchUpFormats[], eventIds[], isMatchUpTie }
  sortCourtsData, // boolean - optional
  nextMatchUps, // boolean - include winnerTo and loserTo matchUps
  status, // optional string - publish status key, defaults to 'PUBLIC'
});
```

### Publish-state filtering

When `usePublishState: true`, the method reads the `PUBLISH.STATUS` timeItem from the tournament and applies the following filters:

- **Published dates**: only matchUps whose `scheduledDate` is in `orderOfPlay.scheduledDates` are returned. An empty `scheduledDates` array (or omitted) means all dates are published.
- **Published events**: if `orderOfPlay.eventIds` is non-empty, only matchUps from those events are returned.
- **Published draws**: only matchUps from published draws are included, determined by event-level publish status.

### Embargo enforcement

When `usePublishState: true`, this method also enforces [embargo](../concepts/publishing/publishing-embargo.md) timestamps at all levels:

- **Order of Play embargo**: returns empty `dateMatchUps` if the OOP embargo timestamp has not passed
- **Draw embargo**: filters out matchUps from embargoed draws
- **Stage embargo**: filters out matchUps from embargoed stages
- **Structure embargo**: filters out matchUps from embargoed structures
- **Round-level filtering**: `roundLimit` on a structure caps which rounds appear in the schedule. `scheduledRounds` is an override map for per-round control within the ceiling — unlisted rounds pass through normally; `{ published: false }` hides the round; embargoed rounds are returned **without schedule data** (schedule stripped) until the embargo passes. See [Scheduled Rounds](../concepts/publishing/publishing-embargo.md#scheduled-rounds).

**See**: [Embargo](../concepts/publishing/publishing-embargo.md) for details on how embargo timestamps work.

---

## disableTieAutoCalc

Disable default behavior of auto calculating TEAM matchUp scores.

```js
engine.disableTieAutoCalc({ drawId, matchUpId });
```

This is a **per-matchUp** override — "this particular tie's score was entered by hand" — and is cleared when
the score is removed. To state that an entire competition publishes only team results and never line detail,
declare [`scoreSource: REPORTED`](/docs/concepts/tieFormat#score-source--derived-vs-reported) on the
tieFormat instead: it is inherited by every tie under it and carries no per-matchUp state.

---

## enableTieAutoCalc

Re-enable default behavior of auto calculating TEAM matchUp scores, and trigger auto calculation.

```js
engine.enableTieAutoCalc({ drawId, matchUpId });
```

---

## drawMatchUps

Returns matchUps from a specific draw with filtering options.

```js
const { matchUps } = engine.drawMatchUps({
  drawId, // required
  matchUpFilters, // optional - filter criteria
  inContext, // optional - add context attributes
});
```

---

## eventMatchUps

Returns matchUps from a specific event with filtering options.

```js
const { matchUps } = engine.eventMatchUps({
  eventId, // required
  matchUpFilters, // optional
  inContext, // optional
});
```

---

## filterMatchUps

Filters matchUps based on provided criteria.

```js
const { matchUps } = engine.filterMatchUps({
  matchUps, // required - matchUps to filter
  matchUpFilters, // required - filter criteria
});
```

---

## findMatchUp

Finds a matchUp by `matchUpId`. If `drawId` is not provided, performs a brute-force search across all tournament matchUps.

```js
const {
  matchUp, // HydratedMatchUp — the found matchUp
  structure, // Structure — containing structure (convenience)
  drawDefinition, // DrawDefinition — containing draw (convenience)
} = engine.findMatchUp({
  matchUpId, // required — matchUp to find
  drawId, // optional — narrows search scope; auto-resolved if omitted
  eventId, // optional — narrows search scope
  inContext, // optional boolean — hydrate matchUp with context (drawId, structureId, participants, etc.)
  nextMatchUps, // optional boolean — include winnerTo and loserTo matchUp details
  afterRecoveryTimes, // optional boolean — include recovery time calculations
  participantsProfile, // optional — control participant hydration (see getParticipants())
  contextProfile, // optional — control which context attributes are included
  contextContent, // optional — pre-computed context content (optimization)
});
```

---

## getAllDrawMatchUps

Returns all matchUps from all structures in a draw.

```js
const { matchUps } = engine.getAllDrawMatchUps({
  drawId, // required
  inContext, // optional
});
```

---

## getAllStructureMatchUps

Returns all matchUps from all structures.

```js
const { matchUps } = engine.getAllStructureMatchUps({
  structures, // required - array of structures
  inContext, // optional
});
```

---

## getCheckedInParticipantIds

Returns the ids checked in for a hydrated matchUp. A side is counted as checked in when all its individuals
are, and a side checked in (from a record predating 7.0.0) checks in its individuals. Every hydrated matchUp
already carries `checkedInParticipantIds` and `allParticipantsCheckedIn`. For the desk's view, with names and
counts, see `getMatchUpCheckInState`.

```js
const { checkedInParticipantIds, allParticipantsCheckedIn, allRelevantParticipantIds } =
  engine.getCheckedInParticipantIds({
    matchUp, // required — hydrated ({ inContext: true })
  });
```

---

## getCompetitionMatchUps

Returns matchUps from all tournaments in a competition.

```js
const { matchUps } = engine.getCompetitionMatchUps({
  tournamentRecords, // required
  matchUpFilters, // optional
});
```

---

## getEventMatchUpFormatTiming

Returns format timing configuration for an event. When `categoryType` is not supplied it is resolved from the event's own category.

```js
const { eventMatchUpFormatTiming } = engine.getEventMatchUpFormatTiming({
  eventId, // required
  matchUpFormats, // optional - can be retrieved from policy
  categoryType, // optional - falls back to the event's category when not supplied
});
```

See [queryGovernor.getEventMatchUpFormatTiming](/docs/governors/query-governor#geteventmatchupformattiming) for category resolution details.

---

## getMatchUpCheckInState

Who is at the desk for a matchUp: each individual who may check in (an INDIVIDUAL side, or each member of a
PAIR or TEAM side; never the PAIR or TEAM itself), whether they have, and the counts. One call for a check-in
desk, so a client does not re-derive the membership rule. Who attested a check-in is not included; that is
`getMatchUpCheckInHistory`'s, which a server can gate on its own.

```js
const { participants, total, checkedInCount, allCheckedIn, partial } = engine.getMatchUpCheckInState({
  matchUpId, // required unless matchUp is given
  drawId, // optional; resolved from matchUpId when absent
  matchUp, // optional — a hydrated matchUp, used as is
});
// participants: [{ participantId, participantName, sideNumber, checkedIn }], side 1 first
// allCheckedIn is false when there is nobody to check in; partial means some but not all
```

---

## getMatchUpCompetitiveProfile

Returns competitive profile analysis for a matchUp.

```js
const { profile } = engine.getMatchUpCompetitiveProfile({
  matchUp, // required
});
```

---

## getMatchUpContextIds

**8.0.0 engine-removal candidate.** This 7.x route remains available pending review. The full reference has moved to [`getMatchUpContextIds`](/docs/implementation/records/getMatchUpContextIds). Package-export status is a separate decision.

## getMatchUpDailyLimits

Returns daily participation limits for matchUps. `undefined` when no scheduling policy is attached.

```js
const { matchUpDailyLimits } = engine.getMatchUpDailyLimits();
```

See [queryGovernor.getMatchUpDailyLimits](/docs/governors/query-governor#getmatchupdailylimits) for
the `undefined`-means-no-limit contract.

---

## getMatchUpDailyLimitsUpdate

Calculates updated daily limits after a matchUp.

```js
const { updatedLimits } = engine.getMatchUpDailyLimitsUpdate({
  participantId, // required
  matchUpFormat, // required
});
```

---

## getMatchUpDependencies

Builds a directed acyclic graph (DAG) of matchUp dependencies across all structures and draws. Returns the complete transitive closure of upstream matchUpIds, direct downstream dependents, optional participant tracking, and cross-structure POSITION link dependencies (e.g., Round Robin → Playoff).

Used internally by the [automated scheduling](../concepts/automated-scheduling.md) pipeline to enforce dependency ordering, recovery time, and participant conflict constraints. Also used by the `DependencyAdapter` pattern in `courthive-components` for interactive [scheduling profile](../concepts/scheduling-profile.mdx) validation.

```js
const {
  matchUpDependencies, // Record<matchUpId, { matchUpIds, dependentMatchUpIds, participantIds, sources }>
  sourceMatchUpIds, // Record<matchUpId, string[]> — direct feeder matchUpIds
  positionDependencies, // Record<structureId, string[]> — cross-structure POSITION link deps
  matchUps, // HydratedMatchUp[] — the matchUps used for analysis
} = engine.getMatchUpDependencies({
  includeParticipantDependencies, // optional boolean (default false)
  drawDefinition, // optional — scope to a single draw
  matchUps, // optional — pre-fetched inContext matchUps
  matchUpIds, // optional — restrict to specific matchUpIds
  drawIds, // optional — restrict to specific drawIds
});
```

For full documentation including return value details, cross-structure awareness, scheduling integration, and the DependencyAdapter pattern, see [getMatchUpDependencies in the Query Governor](./query-governor.md#getmatchupdependencies).

---

## getMatchUpFormat

Returns the matchUp format for a matchUp.

```js
const { matchUpFormat } = engine.getMatchUpFormat({
  matchUpId, // required
  drawId, // optional
  eventId, // optional
});
```

---

## getMatchUpFormatTiming

Returns timing parameters for a matchUp format.

```js
const { averageMinutes, recoveryMinutes, typeChangeRecoveryMinutes, overnightMinutes, recoveryFromPlayedMinutes } =
  engine.getMatchUpFormatTiming({
    matchUpFormat, // required
    eventType, // optional - defaults to SINGLES
    categoryName, // optional
    categoryType, // optional
    policyDefinitions, // optional - evaluate against a policy not attached to the record
    playedMinutes, // optional - measured duration; keys byPlayedMinutes bands
  });
```

See [queryGovernor.getMatchUpFormatTiming](/docs/governors/query-governor#getmatchupformattiming) for the full parameter and return reference.

---

## getMatchUpFormatTimingUpdate

Returns updated timing after format modifications.

```js
const { timing } = engine.getMatchUpFormatTimingUpdate({
  matchUpFormat, // required
  modifications, // required
});
```

---

## getMatchUpParticipantIds

The ids of a hydrated matchUp's participants. `individualParticipantIds` is who may check in.

```js
const { individualParticipantIds, sideParticipantIds, nestedIndividualParticipantIds, allRelevantParticipantIds } =
  engine.getMatchUpParticipantIds({
    matchUp, // required — hydrated ({ inContext: true })
  });
```

Potential participants (the possible winners of a feeding matchUp) are not included.

---

## getMatchUpScheduleDetails

Returns detailed schedule information for a matchUp, including its live duration as `schedule.time` and `schedule.milliseconds` (read at [competition time](/docs/concepts/competition-clock#live-matchup-duration)). See [`getMatchUpScheduleDetails`](/docs/governors/query-governor#getmatchupscheduledetails) for the full shape.

```js
const { schedule } = engine.getMatchUpScheduleDetails({
  matchUpId, // required
  drawId, // required
});
```

---

## getMatchUpType

**8.0.0 engine-removal candidate.** This 7.x route remains available pending review. The full reference has moved to [`getMatchUpType`](/docs/implementation/records/getMatchUpType). Package-export status is a separate decision.

## getMatchUpUpset

Whether a matchUp's result was an upset: the side that lost was the stronger on the chosen basis.

```js
const { isUpset, basis, winningSide, winnerValue, loserValue, info } = engine.getMatchUpUpset({
  matchUp, // required: a matchUp object, e.g. from allTournamentMatchUps({ inContext: true })
  scaleType, // optional: 'SEEDING' (default), 'RANKING' or 'RATING'
  scaleName, // required for RANKING and RATING, e.g. 'WTN'
  scaleAccessor, // optional: overrides the scale's declared value accessor
  ascending, // optional: a RATING scale's direction, for a scale ratingsParameters does not know
  singlesForDoubles, // optional: rate a doubles matchUp by its players' SINGLES values
});
```

- **Only a fully scored result can be an upset**: `COMPLETED`, with a `winningSide` and a score whose every set is
  finished and legal under the matchUp's `matchUpFormat` (the same completeness rule the score-entry dialog applies).
  A retirement, walkover or default answers `isUpset: false` with `info: 'not a fully scored result'`.
- **SEEDING**: the loser was seeded and the winner was unseeded or a lower seed (a higher number). `~` is
  unseeded; a seed block such as `5-8` counts as its first seed.
- **RANKING**: a lower ranking position is stronger. Both sides need a value on `scaleName`.
- **RATING**: the direction is the scale's own, from `ratingsParameters` (lower WTN is stronger; higher UTR, ELO,
  DUPR are). Values may be stored as strings. A pair is rated by its players' mean. Both sides need a value; a
  scale of unknown direction is an error unless `ascending` is given.

Ratings and rankings are read from the hydrated participants (`participant.ratings` / `participant.rankings` by
matchUpType), as `getEventData` and `allTournamentMatchUps({ inContext: true })` provide them.

---

## getMatchUpsStats

Returns statistics for a collection of matchUps.

```js
const { stats } = engine.getMatchUpsStats({
  matchUps, // required
});
```

---

## getModifiedMatchUpFormatTiming

Returns timing with custom modifications applied.

```js
const { timing } = engine.getModifiedMatchUpFormatTiming({
  matchUpFormat, // required
  eventId, // optional
});
```

---

## getParticipantResults

Returns results for participants across matchUps.

```js
const { results } = engine.getParticipantResults({
  matchUps, // required
});
```

---

## getPredictiveAccuracy

Returns accuracy metrics for predictive algorithms.

```js
const { accuracy } = engine.getPredictiveAccuracy({
  matchUps, // required
});
```

---

## getRoundMatchUps

Returns matchUps for a specific round.

```js
const { matchUps } = engine.getRoundMatchUps({
  drawId, // required
  structureId, // required
  roundNumber, // required
});
```

---

## getRounds

Returns round information for a structure.

```js
const { rounds } = engine.getRounds({
  drawId, // required
  structureId, // required
});
```

---

## getHomeParticipantId

```js
const { homeParticipantId } = engine.getHomeParticipantId({ matchUp });
```

---

## isValidMatchUpFormat

Validates a matchUp format string or object.

```js
const { valid } = engine.isValidMatchUpFormat({
  matchUpFormat, // required
});
```

---

## matchUpActions

Returns available actions for a matchUp. The returned `validActions` array contains action objects with `type`, `method`, and `payload` that can be dispatched. Action types include `SCORE`, `STATUS`, `SCHEDULE`, `REFEREE`, `ADD_PENALTY`, `START`, and `END`.

```js
const {
  validActions, // array of action objects
  structureIsComplete, // boolean — all matchUps in the structure are complete
  isDoubleExit, // boolean — matchUp has DOUBLE_WALKOVER or DOUBLE_DEFAULT
  isByeMatchUp, // boolean — matchUp involves a BYE
} = engine.matchUpActions({
  matchUpId, // required — target matchUp
  drawId, // optional — resolved by engine; auto-resolved via brute force if omitted
  policyDefinitions, // optional — override matchUp action policies
  sideNumber, // optional — restrict actions to a specific side (1 or 2)
  participantId, // optional — scope actions to a specific participant
  enforceGender, // optional boolean — enforce gender restrictions for tie matchUp assignments
  restrictAdHocRoundParticipants, // deprecated, no effect — a participant (or a PAIR sharing one of its individuals) already in the round is never offered
  tournamentParticipants, // optional — pre-fetched participants (optimization)
  inContextDrawMatchUps, // optional — pre-fetched inContext matchUps (optimization)
  matchUpsMap, // optional — pre-fetched matchUps map (optimization)
});
```

---

## participantScheduledMatchUps

**8.0.0 engine-removal candidate.** This 7.x route remains available pending review. The full reference has moved to [`participantScheduledMatchUps`](/docs/implementation/records/participantScheduledMatchUps). Package-export status is a separate decision.

## publicFindMatchUp

Finds a matchUp with privacy policies applied.

```js
const { matchUp } = engine.publicFindMatchUp({
  matchUpId, // required
  policyDefinitions, // optional
});
```

---

## removeMatchUpSideParticipant

Removes participant assigned to AD_HOC matchUp.

```js
engine.removeMatchUpSideParticipant({
  sideNumber, // number - required
  matchUpId, // required
  drawId, // required
});
```

---

## replaceTieMatchUpParticipantId

```js
engine.replaceTieMatchUpParticipantId({
  existingParticipantId,
  newParticipantId,
  tieMatchUpId,
  drawId,
});
```

The new player follows the rule of [assignTieMatchUpParticipantId](#assigntiematchupparticipantid): refused when on another team of the event, a `NOT_ON_TEAM_ROSTER` warning when on none.

Refused with `INVALID_MATCHUP` when `tieMatchUpId` names a SINGLES or DOUBLES matchUp that is not a line of a TEAM matchUp (7.8.0; before, the refusal named an unrelated cause: team not found, not found, or missing matchUp). A TEAM matchUp itself is refused the same way.

---

## removeTieMatchUpParticipantId

```js
engine.removeTieMatchUpParticipantId({
  participantId, // id of INDIVIDUAL or PAIR be removed
  tieMatchUpId, // tieMatchUp, matchUpType either DOUBLES or SINGLES
  drawId, // draw within which tieMatchUp is found
});
```

Refused with `INVALID_MATCHUP` when `tieMatchUpId` names a SINGLES or DOUBLES matchUp that is not a line of a TEAM matchUp (7.8.0; before, the refusal named an unrelated cause: team not found, not found, or missing matchUp). A TEAM matchUp itself is refused the same way.

---

## removeDelegatedOutcome

Removes a delegated outcome from a matchUp. Announced with `MODIFY_MATCHUP`, as `setDelegatedOutcome` is; a matchUp with
no delegated outcome sends nothing.

```js
engine.removeDelegatedOutcome({
  matchUpId, // required
  drawId, // required
  disableNotice, // optional boolean - send no notice
});
```

---

## resetMatchUpLineUps

Clears lineups from a TEAM matchUp.

```js
engine.resetMatchUpLineUps({
  matchUpId, // required
  drawId, // required
});
```

---

## resetAdHocMatchUps

Will remove all results (scores) and optionally all participant assignments from specified matchUps (via matchUpIds or roundNumbers).

```js
const result = engine.resetAdHocMatchUps({
  removeAssignments, // optional; remove all assigned participants
  roundNumbers, // optional if matchUpids provided
  matchUpIds, // optional only if roundNumber(s) provided
  structureId, // optional unless matchUpIds not provided
  drawId,
};

export function resetAdHocMatchUps(params: ResetAdHocMatchUps) {
  const paramsCheck = checkRequiredParameters(params, [
    { [DRAW_DEFINITION]: true, [EVENT]: true },
    {
      [ONE_OF]: { [MATCHUP_IDS]: false, roundNumbers: false },
      [INVALID]: INVALID_VALUES,
      [OF_TYPE]: ARRAY,
    },
  ]);
  if (paramsCheck.error) return paramsCheck;

  const structureResult = getAdHocStructureDetails(params);
  if (structureResult.error) return structureResult;
  const { matchUpIds } = structureResult;
})
```

---

## resetScorecard

Removes all scores from `tieMatchUps` within a TEAM `matchUp`; preserves `lineUps`. If `tiebreakReset` is true, checks whether a "Tiebreaker" collectionDefinition was added to the matchUp's tieFormat and resets it back to the inherited tieFormat if so.

Validates that the matchUp is `{ matchUpType: TEAM }` and that there are no active downstream matchUps (returns `CANNOT_CHANGE_WINNING_SIDE` error if downstream is active).

```js
engine.resetScorecard({
  matchUpId, // required — must be a TEAM matchUp
  drawId, // required — resolved to drawDefinition by engine
  tiebreakReset, // optional boolean — check for added tiebreak collectionDefinition and reset tieFormat
  matchUpStatus, // optional — set a specific matchUpStatus after reset
});
```

---

## resetTieFormat

Remove the `tieFormat` from a TEAM `matchUp` if there is a `tieFormat` further up the hierarchy; modifies `matchUp.tieMatchUps` to correspond.

```js
engine.resetTieFormat({
  tournamentId, // required
  matchUpId, // must be a TEAM matchUp
  drawId, // required
  uuids, // optional - in client/server scenarios generated matchUps must have equivalent matchUpIds
});
```

---

## setDelegatedOutcome

Sets a delegated outcome for a matchUp (e.g., referee decision, or a crowd-sourced
score the tournament director has accepted as provisional).

The `outcome` is the canonical outcome shape. Its `score` may be supplied either
as pre-derived per-side strings (`{ scoreStringSide1, scoreStringSide2 }`) or as a
canonical `{ sets }` array. When only `sets` is supplied, the per-side score
strings are derived internally via `generateScoreString`, so callers never have to
round-trip the score into strings.

```js
engine.setDelegatedOutcome({
  matchUpId, // required
  drawId, // required
  outcome, // required - { score: { sets } | { scoreStringSide1, scoreStringSide2 }, winningSide?, matchUpStatus? }
});
```

---

## setMatchUpFormat

Sets the `matchUpFormat` for a specific `matchUp` or for any scope within the hierarchy of a `tournamentRecord`.

:::info
If an array of `scheduledDates` is provided then `matchUps` which have `matchUpStatus: TO_BE_PLAYED` and are scheduled to be played on the specified dates will have their `matchUpFormat` fixed rather than inherited. This means that subsequent changes to the parent `structure.matchUpFormat` will have no effect on such `matchUps`.

The `force` attribute will remove the `matchUpFormat` from all targeted `matchUps` which have `matchUpStatus: TO_BE_PLAYED`; this allows the effect of using `scheduledDates` to be reversed. Use of this attribute will have no effect if `scheduledDates` is also provided.

:::

```js
engine.setMatchUpFormat({
  matchUpFormat, // CODES matchUpFormatCode
  eventType, // optional - restrict to SINGLES or DOUBLES

  matchUpId, // optional - set matchUpFormat for a specific matchUp
  drawId, // required only if matchUpId, structureId or structureIds is present
  force, // optional boolean - when setting for structure, draws or events, strip any defined matchUpFormat from all TO_BE_PLAYED matchUps

  // scoping options
  scheduledDates, // optional - ['2022-01-01']
  stageSequences, // optional - [1, 2]
  structureIds, // optional - ['structureId1', 'structureId2']
  structureId, // optional
  eventIds, // optional - ['eventId1', 'eventId2']
  eventId, // optional
  drawIds, // optional - ['drawId1', 'drawId2']
  stages, // optional - ['MAIN', 'CONSOLATION']
});
```

---

## setMatchUpState

**Deprecated on the engine surface since 7.5.0; removed at the next major.** This is the internal
state writer behind [`setMatchUpStatus`](#setmatchupstatus). Called directly it skips the scoring
policy's say over the propagation flags, score-string derivation, format validation and the
exit-propagation cascade, so the draw may not agree with the result. Use `setMatchUpStatus`.

```js
engine.setMatchUpState({
  matchUpId, // required
  drawId, // required
  matchUpStatus, // optional
  score, // optional
  winningSide, // optional
});
```

---

## setMatchUpStatus

Sets either matchUpStatus or score and winningSide; values to be set are passed in outcome object. Handles any winner/loser participant movements within or across structures, including multi-level consolation propagation (e.g., COMPASS draws). See examples: [Setting Scores](../concepts/matchup-overview.md#setting-scores), [MatchUp Operations](../engines/engine-middleware.md#matchup-operations), [Real-World Example: Live Scoring Updates](../engines/mutation-engines.md#real-world-example-live-scoring-updates).

```js
const outcome = {
  matchUpStatus, // optional — e.g. COMPLETED, RETIRED, WALKOVER, DEFAULTED, DOUBLE_WALKOVER
  matchUpStatusCodes, // optional — array of status code strings
  winningSide, // optional — 1 or 2
  score, // optional — { sets } — see note; per-side strings are derived, not accepted
  matchUpFormat, // optional — override matchUpFormat for this matchUp
};

engine.setMatchUpStatus({
  matchUpId, // required
  drawId, // required — resolved to drawDefinition by engine
  outcome, // optional — score/status/winningSide object

  matchUpFormat, // optional — set matchUpFormat before applying score (validated against); a score with no resolvable format is refused
  disableScoreValidation, // optional boolean — skip score validation, including the completeness rule below
  allowChangePropagation, // optional boolean — allow winner/loser swap to propagate through structures; a scoring policy that sets it wins
  propagateExitStatus, // optional boolean — propagate exit status (WALKOVER, etc.) to consolation matchUps; a scoring policy that sets it wins
  propagateRetirementAsExit, // optional boolean — with propagateExitStatus, carry a RETIRED loser on as an exit (default false); a scoring policy that sets it wins
  disableAutoCalc, // optional boolean — applies only to TEAM matchUps
  enableAutoCalc, // optional boolean — applies only to TEAM matchUps
  setTBlast, // optional boolean — when true, tiebreak score appears last in set score string
  policyDefinitions, // optional — scoring policies
  tournamentId, // optional — for multi-tournament operations
  eventId, // optional — helps resolve drawDefinition
  notes, // optional — add note (string) to matchUp object

  schedule: {
    // optional — set schedule items alongside status
    courtIds, // optional — applies only to TEAM matchUps => creates .allocatedCourts
    courtId, // optional — requires scheduledDate
    venueId, // optional
    scheduledDate, // optional
    scheduledTime, // optional
    startTime, // optional
    endTime, // optional
  },
});
```

### What one call sets in motion

A result is rarely a write to one matchUp. `setMatchUpStatus` is the entry to the
[outcome pipeline](../concepts/outcome-pipeline.md). In one call it can:

- advance the winner;
- direct the loser into a linked structure;
- place a BYE where nobody will ever arrive;
- carry an exit on to the loser's next matchUp.

When a result is corrected, the same call takes back exactly what the earlier result placed. Each
step can set off the next, several rounds or structures away.
[Exit propagation](../concepts/exit-propagation.md) describes that cascade and what the engine
guarantees while it runs.

Providers settle these questions differently, so the pipeline has nine settings. Four can be passed
on the call. The other five are read only from a policy attached to the tournament, event or draw.

#### Settings passed on the call

| Setting                     | What it decides                                                                                                                                                                                                           | Absent policy and call |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| `propagateExitStatus`       | Whether a `WALKOVER` or `DEFAULTED` follows the loser into the matchUp they are fed to, as a [carried exit](../concepts/exit-propagation.md#the-pending-propagated-exit), rather than arriving as an ordinary loser       | off                    |
| `propagateRetirementAsExit` | With `propagateExitStatus` on: whether a `RETIRED` loser arrives as an exit, a walkover to the opponent, or as an ordinary loser who may still play. [Details](../concepts/exit-propagation.md#propagateretirementasexit) | `false`                |
| `allowChangePropagation`    | Whether a changed `winningSide` on a matchUp whose winner has already advanced swaps winner and loser downstream                                                                                                          | off                    |
| `disableScoreValidation`    | Skips both score checks, bounds and completeness (see [below](#a-completed-score-must-be-complete)). Used for imports and corrections to history. Read from the call only                                                 | validated              |

**The policy governs, both ways.** A scoring policy that sets one of the first three to `true` or
`false` overrides the value passed on the call. The call decides only where the policy is silent
(since 7.5.0). The resolution is `policy ?? param ?? default`. `POLICY_SCORING_DEFAULT` is silent on
all three. `POLICY_SCORING_USTA` sets both exit flags to `true`. See
[Scoring Policy](../policies/scoringPolicy.md).

#### Settings read from an attached policy

| Policy                                          | Setting                         | What it decides                                                                                                                                                                                                                                        | Absent the setting |
| ----------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------ |
| [scoring](../policies/scoringPolicy.md)         | `requireParticipantsForScoring` | Whether both participants must be present before a matchUp is scored. Only `false` relaxes it. A single exit can be recorded against the one participant present either way ([below](#recording-an-exit-before-the-second-opponent-arrives))           | required           |
| [progression](../policies/progressionPolicy.md) | `doubleExitPropagateBye`        | A double exit sends nobody on. This setting decides what fills the seat in a linked structure that its loser would have taken: a BYE (`true`) or a produced `WALKOVER` / `DEFAULTED` (`false`). The double exit's own structure is the same either way | `true`             |
| [progression](../policies/progressionPolicy.md) | `autoPlaceQualifiers`           | Whether a qualifier is placed into an open qualifier position in the main structure when they win through                                                                                                                                              | `false`            |
| [progression](../policies/progressionPolicy.md) | `autoReplaceQualifiers`         | Whether a placed qualifier is replaced when the qualifying result's `winningSide` changes                                                                                                                                                              | `false`            |
| [progression](../policies/progressionPolicy.md) | `autoRemoveQualifiers`          | Whether a placed qualifier is removed when the qualifying result is removed                                                                                                                                                                            | `false`            |

`POLICY_SCORING_DEFAULT` sets `requireParticipantsForScoring: false`, so a tournament with it
attached can score a matchUp that is missing a participant. `POLICY_PROGRESSION_DEFAULT` sets the
four progression values shown in the table. `POLICY_PROGRESSION_USTA` differs from it only in
`doubleExitPropagateBye: false`: USTA requires a produced `WALKOVER`, not a BYE, in the linked structure.

**How the exit settings are tested.** Since 7.0.0 an
[exit-propagation harness](../testing/exit-propagation-harness.md) has driven the settings that
shape the cascade.

- A 600-cell matrix crosses ten draw types with draw sizes, exit statuses and `propagateExitStatus`.
- Relational suites check undo, idempotence, monotonicity and order independence.
- A route differential enters the same outcome with and without `allowChangePropagation` and
  compares the draws.
- A randomized census runs three arms: `allowChangePropagation` off, `allowChangePropagation` on,
  and `doubleExitPropagateBye: false`. It plays each draw forward in a random order,
  at 135,000 seeds per arm per run, and checks every resulting draw for
  inconsistencies.

The qualifier settings and `requireParticipantsForScoring` are covered by ordinary unit tests and
not by the census.

**Warnings.** A successful call can return `warnings`. When the recorded score holds a set decided by
its tiebreak with no tiebreak points (`7-6`), the result carries
`{ code: 'TIEBREAK_POINTS_NOT_RECORDED', setNumbers }` (since 7.5.0). It is not reported under
`disableScoreValidation`, nor for a TEAM matchUp, whose score is the dual's tally.

### A completed score must be complete

Score validation asks two questions of `score.sets`, under the matchUp's effective
`matchUpFormat`:

1. **Bounds** — no set exceeds what the format allows, and the `winningSide` named is the
   one the set counts produce.
2. **Completeness** — every set is one the format could actually produce:
   - every set **before the last** is a finished, legal set;
   - the **last** set is finished too when the outcome claims completion (`COMPLETED`, or
     a `winningSide` with no `matchUpStatus`);
   - otherwise (`RETIRED`, `DEFAULTED`, `IN_PROGRESS`, `SUSPENDED` …) the last set may be
     unfinished, but never past the format's ceiling. This holds even when the set carries
     a `winningSide`, as `parseScoreString` gives one to the side leading an unfinished set.

Under `SET3-S:6/TB7` this refuses `3-7 6-4 6-4` (a 7-3 set does not exist with a tiebreak
at six) and `4-2 2-6 2-6` (the first set never finished), both of which were previously
recorded as `COMPLETED`. A refusal returns `INVALID_SCORE` with an `info` naming the set,
e.g. `Set 1: …`, and the matchUp is left unchanged. A score with no resolvable `matchUpFormat` is refused with `ERR_MISSING_MATCHUP_FORMAT`
(CA, 2026-10-02): every rule above is a question about the format. A TEAM line's format is its
collection definition's, and is resolved from there.

**To record a score the format cannot produce** — an import, a migration, a correction to
history, an abandoned line — pass `disableScoreValidation: true`. It skips both questions.

Three tiebreak records are settled (CA, 2026-10-02):

- **`7-6` with no tiebreak points is a finished set.** It is recorded, and `validateScore` names
  the set in a `TIEBREAK_POINTS_NOT_RECORDED` warning. Score entry still asks for the points: the
  completeness check used while typing does not call a bare `7-6` finished.
- **A match tiebreak recorded as `1-0` in its game fields** is a finished set whose points were not
  kept. `1-0` in the tiebreak-point fields is refused, except under `TB1`.
- **Impossible tiebreak points are refused**, such as `7-6(10-7)` with a tiebreak to seven. An
  ingestion pipeline can call `scoreGovernor.repairScore` first, which drops such points and keeps
  `7-6`.

### Score strings are derived, never trusted

`score.sets` is the source of truth. `scoreStringSide1` / `scoreStringSide2` are
**regenerated from `sets` on every call**, and any strings supplied by the caller are
discarded rather than persisted.

Previously generation was skipped whenever the caller supplied its own strings, so a
client could persist strings the factory would never emit and its own `parseScoreString`
could not round-trip — including set scores present in the string but absent from `sets`.
Callers that hand-author score strings should stop doing so; send `sets` and read the
derived strings back.

Two consequences worth knowing:

- The matchUp's **effective** `matchUpFormat` is resolved via `getMatchUpFormat` rather
  than read off `outcome.matchUpFormat`, which is usually absent. Without it a
  tiebreak-only deciding set (`F:TB10`) rendered as a plain game score instead of
  `[10-8]`.
- The derived score object is **merged into** `outcome.score` rather than replacing it,
  so non-derived attributes such as `score.side1PointScore` survive.

### Recording an exit before the second opponent arrives

A `WALKOVER` or `DEFAULTED` can be recorded against the one participant present before the opponent
arrives, whether or not `propagateExitStatus` is on (since 7.5.0). The outcome names no winner, or
awards the empty side; whoever later arrives takes the walkover and advances. See
[Who may receive a directing outcome](../concepts/outcome-pipeline.md#21-who-may-receive-a-directing-outcome)
and the `EXIT` action in [MatchUp Actions](../policies/matchUpActions.md).

A double exit (`DOUBLE_WALKOVER`, `DOUBLE_DEFAULT`) entered directly needs both seats reached: one
exit per seat. Beside a seat nobody has reached it is refused (since 7.5.0).

### Reversing a propagated exit

A propagated exit can advance through a consolation BYE into a later matchUp that then
**resolves** — a real participant falls through into the empty winner slot and advances
onward. Once that has happened the downstream consolation matchUp is active, and the
standard active-downstream rule applies: **the source result cannot be reset** to
`TO_BE_PLAYED` until the resolving consolation matchUps are undone first. This holds
whether you attempt to reset the exit source itself or the later fall-through completion,
and for both `WALKOVER` and `DEFAULTED` exits.

`isActiveDownstream` looks **past** the fed FMLC BYE the exit advanced through, so the
resolved walkover is correctly detected as active rather than being masked by the BYE. A
still-**pending** propagated exit (its winning side is an empty feed slot, nothing has
fallen through yet) is not active, so the source result can still be reset while pending.

A carried exit is corrected at its **origin**. Where the exit was carried, a direct write that
would re-score it, name another winner, relabel it as a played result or clear it is refused with
`CANNOT_CHANGE_OUTCOME`; clearing or re-scoring the origin re-derives it (since 7.5.0).

An exit **recorded** against a vacant side, rather than carried there, is active whatever the other
side holds. Flipping the winner of the matchUp that feeds it is refused with
`CANNOT_CHANGE_WINNING_SIDE` (since 7.5.0).

### Reverting a completed matchUp to a live status

A `COMPLETED` matchUp whose score **validates as a completed outcome** (a decisive
`winningSide` backed by valid completed sets) cannot be reverted directly to a "still
live" status — `IN_PROGRESS` or `SUSPENDED` — when no new outcome is supplied. Such a
call returns `INCOMPATIBLE_MATCHUP_STATUS`. This guards against a completed result being
silently stripped and the draw un-advanced (e.g. an upstream client re-asserting
`IN_PROGRESS` on already-finished matches).

The guard is deliberately narrow:

- **Allowed** — submitting a new `outcome` (a corrected score / `winningSide`), which is a
  re-score rather than a bare downgrade.
- **Allowed** — reverting `RETIRED` / `DEFAULTED` (irregular endings whose incomplete
  scores do not validate as a completed outcome) to `IN_PROGRESS`.
- **Blocked** — a bare `{ matchUpStatus: IN_PROGRESS }` (or `SUSPENDED`) on a validated
  `COMPLETED` matchUp.

To reopen a completed match, submit a new outcome or clear the result first (e.g.
`removeWinningSide`, or reset to `TO_BE_PLAYED`).

The inverse is also rejected: a **single submission** whose score/winner _implies_
completion cannot carry a live status. Passing an explicit `winningSide`, or a score
that resolves a winner under the matchUpFormat (e.g. `6-2 6-3` in a best-of-3), together
with `matchUpStatus: IN_PROGRESS` (or `SUSPENDED`) returns `INCOMPATIBLE_MATCHUP_STATUS`.
A non-decisive in-progress score (e.g. a single set won in a best-of-3) is unaffected.
TEAM matchUps are excluded (their tie score is auto-calculated).

---

## setOrderOfFinish

Sets the `orderOfFinish` attribute for `matchUps` specified by `matchUpId` in the `finishingOrder` array.

### Validation

Validation is done within a _cohort_ of `matchUps` which have equivalent `structureId`, `matchUpType`, `roundNumber`, and `matchUpTieId` (if applicable).

- `matchUpIds` in `finishingOrder` must be part of the same _cohort_
- `orderOfFinish` values must be unique positive integers within the _cohort_

```js
engine.setOrderOfFinish({
  finishingOrder: [{ matchUpId, orderOfFinish: 1 }],
  drawId,
});
```

---

## substituteParticipant

Substitutes one participant for another in a matchUp.

```js
engine.substituteParticipant({
  matchUpId, // required
  drawId, // required
  participantIdToRemove, // required
  participantIdToAdd, // required
});
```

---

## tallyParticipantResults

Calculates participant results/standings from matchUps.

```js
const { results } = engine.tallyParticipantResults({
  matchUps, // required
});
```

---

## toggleParticipantCheckInState

```js
engine.toggleParticipantCheckInState({
  participantId,
  tournamentId,
  matchUpId,
  drawId,
});. See examples: [Sign-In Management](../concepts/participants.md#sign-in-management).
```

---

## updateTieMatchUpScore

Trigger automatic calculation of the score of a TEAM matchUp.

```js
engine.updateTieMatchUpScore({
  tournamentId, // optional if default tournament set
  matchUpId,
  drawId,
});
```

---

## tournamentMatchUps

Returns all matchUps from the current tournament.

```js
const { matchUps } = engine.tournamentMatchUps({
  matchUpFilters, // optional
  inContext, // optional
});
```

---

## validMatchUp

**8.0.0 engine-removal candidate.** This 7.x route remains available pending review. The full reference has moved to [`validMatchUp`](/docs/implementation/validation/validMatchUp). Package-export status is a separate decision.

## validMatchUps

**8.0.0 engine-removal candidate.** This 7.x route remains available pending review. The full reference has moved to [`validMatchUps`](/docs/implementation/validation/validMatchUps). Package-export status is a separate decision.
