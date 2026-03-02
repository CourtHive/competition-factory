---
title: matchUp Governor
---

```js
import { matchUpGovernor } from 'tods-competition-factory';
```

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

---

## applyLineUps

Applies `lineUps` to the `sides` of a _TEAM_ matchUp. Order is not important as team side is determined automatically. Does not check to ensure that participants in `lineUps` are part of teams; this is assumed. It is possible to have **_some_** participants assigned to a team side who are not part of a team.

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
  teamParticipantId, // optional - participant team can be derived from participantId. This supports assigning "borrowed" players from other teams.
  participantId, // id of INDIVIDUAL or PAIR participant to be assigned to a matchUp
  tieMatchUpId, // matchUpId of a SINGLES or DOUBLES that is part of a matchUp between teams
  sideNumber, // optional - only necessary if a participant is part of both teams (edge case!)
  drawId, // identifies draw in which matchUp is present
});
```

---

## bulkMatchUpStatusUpdate

Provides the ability to update the outcomes of multiple matchUps at once.

```js
const outcomes = [
  {
    eventId,
    drawId,
    matchUpId,
    matchUpFormat,
    matchUpStatus,
    winningSide,
    score,
  },
];
engine.bulkMatchUpStatusUpdate({ outcomes });
```

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

When `usePublishState: true`, this method also enforces [embargo](../concepts/publishing/publishing-embargo) timestamps at all levels:

- **Order of Play embargo**: returns empty `dateMatchUps` if the OOP embargo timestamp has not passed
- **Draw embargo**: filters out matchUps from embargoed draws
- **Stage embargo**: filters out matchUps from embargoed stages
- **Structure embargo**: filters out matchUps from embargoed structures
- **Round-level filtering**: `roundLimit` on a structure caps which rounds appear in the schedule. `scheduledRounds` is an override map for per-round control within the ceiling — unlisted rounds pass through normally; `{ published: false }` hides the round; embargoed rounds are returned **without schedule data** (schedule stripped) until the embargo passes. See [Scheduled Rounds](../concepts/publishing/publishing-embargo#scheduled-rounds).

**See**: [Embargo](../concepts/publishing/publishing-embargo) for details on how embargo timestamps work.

---

## disableTieAutoCalc

Disable default behavior of auto calculating TEAM matchUp scores.

```js
engine.disableTieAutoCalc({ drawId, matchUpId });
```

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

```js
const {
  matchUp,
  structure, // returned for convenience
} = engine.findMatchUp({
  inContext, // optional - boolean - returns matchUp with additional attributes
  matchUpId,
  drawId,
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

Returns participant IDs that have checked in for a matchUp.

```js
const { participantIds } = engine.getCheckedInParticipantIds({
  matchUpId, // required
  drawId, // required
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

Returns format timing configuration for an event.

```js
const { timing } = engine.getEventMatchUpFormatTiming({
  eventId, // required
});
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

Returns context IDs (tournamentId, eventId, drawId) for a matchUp.

```js
const { contextIds } = engine.getMatchUpContextIds({
  matchUpId, // required
});
```

---

## getMatchUpDailyLimits

Returns daily participation limits for matchUps.

```js
const { limits } = engine.getMatchUpDailyLimits();
```

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

Used internally by the [automated scheduling](../concepts/automated-scheduling) pipeline to enforce dependency ordering, recovery time, and participant conflict constraints. Also used by the `DependencyAdapter` pattern in `courthive-components` for interactive [scheduling profile](../concepts/scheduling-profile) validation.

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

For full documentation including return value details, cross-structure awareness, scheduling integration, and the DependencyAdapter pattern, see [getMatchUpDependencies in the Query Governor](./query-governor#getmatchupdependencies).

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
const { timing } = engine.getMatchUpFormatTiming({
  matchUpFormat, // required
});
```

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

## getMatchUpScheduleDetails

Returns detailed schedule information for a matchUp.

```js
const { details } = engine.getMatchUpScheduleDetails({
  matchUpId, // required
  drawId, // required
});
```

---

## getMatchUpType

Returns the matchUp type (SINGLES, DOUBLES, TEAM).

```js
const { matchUpType } = engine.getMatchUpType({
  matchUp, // required
});
```

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

Returns available actions for a matchUp.

```js
const { validActions } = engine.matchUpActions({
  matchUpId, // required
  drawId, // required
  policyDefinitions, // optional
});
```

---

## participantScheduledMatchUps

Returns scheduled matchUps for a specific participant.

```js
const { matchUps } = engine.participantScheduledMatchUps({
  participantId, // required
  scheduleDate, // optional - filter by date
});
```

---

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

---

## removeTieMatchUpParticipantId

```js
engine.removeTieMatchUpParticipantId({
  participantId, // id of INDIVIDUAL or PAIR be removed
  tieMatchUpId, // tieMatchUp, matchUpType either DOUBLES or SINGLES
  drawId, // draw within which tieMatchUp is found
});
```

---

## removeDelegatedOutcome

Removes a delegated outcome from a matchUp.

```js
engine.removeDelegatedOutcome({
  matchUpId, // required
  drawId, // required
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

Removes all scores from `tieMatchUps` within a TEAM `matchUp`; preserves `lineUps`.

```js
engine.resetScorecard({
  tiebreakReset, // optional boolean - check for tiebreak scenarios and reset tieFormat
  tournamentId, // required
  matchUpId, // required - must be a TEAM matchUp
  drawId, // required
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

Sets a delegated outcome for a matchUp (e.g., referee decision).

```js
engine.setDelegatedOutcome({
  matchUpId, // required
  drawId, // required
  outcome, // required - outcome object
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

Sets the state of a matchUp (status, score, winningSide).

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

Sets either matchUpStatus or score and winningSide; values to be set are passed in outcome object. Handles any winner/loser participant movements within or across structures. See examples: [Setting Scores](../concepts/matchup-overview.md#setting-scores), [MatchUp Operations](../engines/engine-middleware.md#matchup-operations), [Real-World Example: Live Scoring Updates](../engines/mutation-engines.md#real-world-example-live-scoring-updates).

```js
const outcome = {
  matchUpStatus, // optional
  winningSide, // optional
  score, // optional
};

engine.setMatchUpStatus({
  disableScoreValidation, // optional boolean
  allowChangePropagation, // optional boolean - allow winner/loser to be swapped and propgate change throughout draw structures
  disableAutoCalc, // optional - applies only to { matchUpType: TEAM }
  enableAutoCalc, // optional - applies only to { matchUpType: TEAM }
  tournamentId,
  matchUpTieId, // optional - if part of a TIE matchUp
  matchUpId,
  outcome, // optional
  drawId,
  schedule: {
    // optional - set schedule items
    courtIds, // optional - applies only to TEAM matchUps => creates .allocatedCourts
    courtId, // requires scheduledDate
    venueId,
    scheduledDate,
    scheduledTime,
    startTime,
    endTime,
  },
  notes, // optional - add note (string) to matchUp object
});
```

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

Validates a single matchUp object.

```js
const { valid, errors } = engine.validMatchUp({
  matchUp, // required
});
```

---

## validMatchUps

Validates an array of matchUp objects.

```js
const { valid, errors } = engine.validMatchUps({
  matchUps, // required
});
```

---
