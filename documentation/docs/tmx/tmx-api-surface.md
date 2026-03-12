---
title: TMX API Surface
sidebar_label: API Surface
sidebar_position: 9
---

# TMX API Surface

This page documents all `tods-competition-factory` methods used by the **TMX client** and the **competition-factory-server**, organized by category. Each method links to its governor documentation page.

---

## TMX Mutation Methods

These 70 methods are invoked via `mutationRequest()` on the client, sent through Socket.IO to the server's `executionQueue`, executed by the factory engine, then applied locally on acknowledgment.

### Event Management

| Method                                                      | Governor | Context                       |
| ----------------------------------------------------------- | -------- | ----------------------------- |
| [addEvent](/docs/governors/event-governor#addevent)         | Event    | Create a new tournament event |
| [deleteEvents](/docs/governors/event-governor#deleteevents) | Event    | Remove one or more events     |
| [modifyEvent](/docs/governors/event-governor#modifyevent)   | Event    | Update event properties       |

### Draw Management

| Method                                                                                    | Governor | Context                                          |
| ----------------------------------------------------------------------------------------- | -------- | ------------------------------------------------ |
| [addDrawDefinition](/docs/governors/event-governor#adddrawdefinition)                     | Event    | Attach a draw definition to an event             |
| [deleteDrawDefinitions](/docs/governors/event-governor#deletedrawdefinitions)             | Event    | Remove draw definitions                          |
| [modifyDrawDefinition](/docs/governors/draws-governor#modifydrawdefinition)               | Draws    | Update draw definition properties                |
| [resetDrawDefinition](/docs/governors/draws-governor#resetdrawdefinition)                 | Draws    | Reset a draw to its initial state                |
| [removeStructure](/docs/governors/draws-governor#removestructure)                         | Draws    | Remove a structure from a draw                   |
| [renameStructures](/docs/governors/draws-governor#renamestructures)                       | Draws    | Rename structures within a draw                  |
| [addPlayoffStructures](/docs/governors/draws-governor#addplayoffstructures)               | Draws    | Add playoff structures to a draw                 |
| [automatedPlayoffPositioning](/docs/governors/draws-governor#automatedplayoffpositioning) | Draws    | Auto-position participants in playoff structures |
| [attachQualifyingStructure](/docs/governors/draws-governor#attachqualifyingstructure)     | Draws    | Link a qualifying structure to a main draw       |

### Draw Generation

| Method                                                                                | Governor   | Context                                   |
| ------------------------------------------------------------------------------------- | ---------- | ----------------------------------------- |
| [generateDrawDefinition](/docs/governors/generation-governor#generatedrawdefinition)  | Generation | Generate a complete draw definition       |
| [generateFlightProfile](/docs/governors/generation-governor#generateflightprofile)    | Generation | Generate flight profile for an event      |
| [attachFlightProfile](/docs/governors/event-governor#attachflightprofile)             | Event      | Attach a flight profile to an event       |
| [deleteFlightAndFlightDraw](/docs/governors/event-governor#deleteflightandflightdraw) | Event      | Remove a flight and its associated draw   |
| [addFlight](/docs/governors/event-governor#addflight)                                 | Event      | Add a flight to an event's flight profile |

### Ad Hoc Draws

| Method                                                                    | Governor | Context                              |
| ------------------------------------------------------------------------- | -------- | ------------------------------------ |
| [addAdHocMatchUps](/docs/governors/draws-governor#addadhocmatchups)       | Draws    | Add matchUps to an ad hoc draw       |
| [deleteAdHocMatchUps](/docs/governors/draws-governor#deleteadhocmatchups) | Draws    | Remove matchUps from an ad hoc draw  |
| [luckyDrawAdvancement](/docs/governors/draws-governor)                    | Draws    | Advance participants in a lucky draw |

### Entry Management

| Method                                                                      | Governor | Context                                          |
| --------------------------------------------------------------------------- | -------- | ------------------------------------------------ |
| [addEventEntries](/docs/governors/entries-governor#addevententries)         | Entries  | Add participants to an event's entry list        |
| [addDrawEntries](/docs/governors/entries-governor#adddrawentries)           | Entries  | Add participants to a draw's entry list          |
| [addEventEntryPairs](/docs/governors/entries-governor#addevententrypairs)   | Entries  | Add doubles pairs to an event                    |
| [modifyEntriesStatus](/docs/governors/entries-governor#modifyentriesstatus) | Entries  | Change entry status (e.g., ALTERNATE, WITHDRAWN) |
| [destroyPairEntries](/docs/governors/entries-governor#destroypairentries)   | Entries  | Break apart doubles pair entries                 |

### Participant Management

| Method                                                                                                | Governor    | Context                                          |
| ----------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------ |
| [addParticipants](/docs/governors/participant-governor#addparticipants)                               | Participant | Add participants to a tournament                 |
| [deleteParticipants](/docs/governors/participant-governor#deleteparticipants)                         | Participant | Remove participants from a tournament            |
| [modifyParticipant](/docs/governors/participant-governor#modifyparticipant)                           | Participant | Update participant details                       |
| [addIndividualParticipantIds](/docs/governors/participant-governor#addindividualparticipantids)       | Participant | Add individuals to a group/team participant      |
| [removeIndividualParticipantIds](/docs/governors/participant-governor#modifyindividualparticipantids) | Participant | Remove individuals from a group/team participant |

### Scoring

| Method                                                                | Governor | Context                          |
| --------------------------------------------------------------------- | -------- | -------------------------------- |
| [setMatchUpStatus](/docs/governors/matchup-governor#setmatchupstatus) | MatchUp  | Set matchUp score and outcome    |
| [resetScorecard](/docs/governors/matchup-governor#resetscorecard)     | MatchUp  | Clear a matchUp's score          |
| [setMatchUpFormat](/docs/governors/matchup-governor#setmatchupformat) | MatchUp  | Set scoring format for a matchUp |

### Positioning

| Method                                                                          | Governor | Context                                 |
| ------------------------------------------------------------------------------- | -------- | --------------------------------------- |
| [setPositionAssignments](/docs/governors/draws-governor#setpositionassignments) | Draws    | Assign participants to draw positions   |
| [setSubOrder](/docs/governors/draws-governor#setsuborder)                       | Draws    | Set sub-ordering within a draw position |

### Scheduling

| Method                                                                         | Governor | Context                            |
| ------------------------------------------------------------------------------ | -------- | ---------------------------------- |
| [addMatchUpScheduleItems](/docs/governors/schedule-governor)                   | Schedule | Add schedule details to a matchUp  |
| [bulkScheduleMatchUps](/docs/governors/schedule-governor#bulkschedulematchups) | Schedule | Schedule multiple matchUps at once |
| [proAutoSchedule](/docs/governors/schedule-governor#proautoschedule)           | Schedule | Automated pro-level scheduling     |

### Team / Tie Operations

| Method                                                                                          | Governor | Context                                 |
| ----------------------------------------------------------------------------------------------- | -------- | --------------------------------------- |
| [modifyTieFormat](/docs/governors/event-governor#modifytieformat)                               | Event    | Modify a tie format definition          |
| [assignTieMatchUpParticipantId](/docs/governors/matchup-governor#assigntiematchupparticipantid) | MatchUp  | Assign a participant to a tie matchUp   |
| [removeTieMatchUpParticipantId](/docs/governors/matchup-governor#removetiematchupparticipantid) | MatchUp  | Remove a participant from a tie matchUp |
| [resetMatchUpLineUps](/docs/governors/matchup-governor#resetmatchuplineups)                     | MatchUp  | Reset lineUps for a team matchUp        |

### Venue Management

| Method                                                                            | Governor | Context                        |
| --------------------------------------------------------------------------------- | -------- | ------------------------------ |
| [addVenue](/docs/governors/venue-governor#addvenue)                               | Venue    | Add a venue to a tournament    |
| [deleteVenues](/docs/governors/venue-governor#deletevenues)                       | Venue    | Remove venues                  |
| [modifyVenue](/docs/governors/venue-governor#modifyvenue)                         | Venue    | Update venue properties        |
| [addCourts](/docs/governors/venue-governor#addcourts)                             | Venue    | Add courts to a venue          |
| [modifyCourt](/docs/governors/venue-governor#modifycourt)                         | Venue    | Update court properties        |
| [modifyCourtAvailability](/docs/governors/venue-governor#modifycourtavailability) | Venue    | Set court availability windows |

### Publishing

| Method                                                                             | Governor   | Context                    |
| ---------------------------------------------------------------------------------- | ---------- | -------------------------- |
| [publishEvent](/docs/governors/publishing-governor#publishevent)                   | Publishing | Publish event data         |
| [unPublishEvent](/docs/governors/publishing-governor#unpublishevent)               | Publishing | Unpublish event data       |
| [publishEventSeeding](/docs/governors/publishing-governor#publisheventseeding)     | Publishing | Publish event seeding      |
| [unPublishEventSeeding](/docs/governors/publishing-governor#unpublisheventseeding) | Publishing | Unpublish event seeding    |
| [publishOrderOfPlay](/docs/governors/publishing-governor#publishorderofplay)       | Publishing | Publish order of play      |
| [unPublishOrderOfPlay](/docs/governors/publishing-governor#unpublishorderofplay)   | Publishing | Unpublish order of play    |
| [publishParticipants](/docs/governors/publishing-governor#publishparticipants)     | Publishing | Publish participant data   |
| [unPublishParticipants](/docs/governors/publishing-governor#unpublishparticipants) | Publishing | Unpublish participant data |

### Seeding / Ratings

| Method                                                                                     | Governor    | Context                                         |
| ------------------------------------------------------------------------------------------ | ----------- | ----------------------------------------------- |
| [generateSeedingScaleItems](/docs/governors/generation-governor#generateseedingscaleitems) | Generation  | Generate seeding from scale items               |
| [setParticipantScaleItems](/docs/governors/participant-governor#setparticipantscaleitems)  | Participant | Set ranking/seeding scale items on participants |
| [addDynamicRatings](/docs/governors/participant-governor#adddynamicratings)                | Participant | Add dynamic ratings to participants             |
| [addParticipantTimeItem](/docs/governors/participant-governor)                             | Participant | Add a time item to a participant                |

### Sign-in

| Method                                                                                                | Governor    | Context                                |
| ----------------------------------------------------------------------------------------------------- | ----------- | -------------------------------------- |
| [modifyParticipantsSignInStatus](/docs/governors/participant-governor#modifyparticipantssigninstatus) | Participant | Update sign-in status for participants |

### Tournament Settings

| Method                                                                       | Governor   | Context                        |
| ---------------------------------------------------------------------------- | ---------- | ------------------------------ |
| [setTournamentDates](/docs/governors/tournament-governor)                    | Tournament | Set tournament start/end dates |
| [setTournamentName](/docs/governors/tournament-governor#settournamentname)   | Tournament | Set tournament name            |
| [setTournamentNotes](/docs/governors/tournament-governor#settournamentnotes) | Tournament | Set tournament notes           |

### Extensions / Resources

| Method                                                                     | Governor   | Context                                   |
| -------------------------------------------------------------------------- | ---------- | ----------------------------------------- |
| [addTournamentExtension](/docs/governors/tournament-governor#addextension) | Tournament | Add an extension to the tournament record |
| [addDrawDefinitionExtension](/docs/governors/draws-governor)               | Draws      | Add an extension to a draw definition     |
| [addEventExtension](/docs/governors/event-governor)                        | Event      | Add an extension to an event              |
| [addTournamentTimeItem](/docs/governors/tournament-governor)               | Tournament | Add a time item to the tournament         |
| [addOnlineResource](/docs/governors/tournament-governor#addonlineresource) | Tournament | Add an online resource (URL, image, etc.) |

### Policies

| Method                                                           | Governor | Context                                   |
| ---------------------------------------------------------------- | -------- | ----------------------------------------- |
| [attachPolicies](/docs/governors/policy-governor#attachpolicies) | Policy   | Attach policy definitions to a tournament |

---

## TMX Query Methods

These ~51 methods are called directly on `tournamentEngine` for read-only operations.

### Tournament State

| Method                                                                             | Governor   | Context                                      |
| ---------------------------------------------------------------------------------- | ---------- | -------------------------------------------- |
| [getTournament](/docs/governors/query-governor)                                    | Query      | Get the full tournament record               |
| [setState](/docs/engines/state-engines)                                            | Engine     | Load a tournament record into the engine     |
| [reset](/docs/engines/state-engines)                                               | Engine     | Clear engine state                           |
| [getTournamentInfo](/docs/governors/tournament-governor#gettournamentinfo)         | Tournament | Get tournament summary info                  |
| [getTournamentTimeItem](/docs/governors/tournament-governor#gettournamenttimeitem) | Tournament | Get a specific time item from the tournament |
| [newTournamentRecord](/docs/governors/tournament-governor#createtournamentrecord)  | Tournament | Create a new empty tournament record         |
| [version](/docs/engines/state-engines)                                             | Engine     | Get factory version                          |

### Event Queries

| Method                                                           | Governor   | Context                                      |
| ---------------------------------------------------------------- | ---------- | -------------------------------------------- |
| [getEvent](/docs/governors/event-governor#getevent)              | Event      | Get a single event by ID                     |
| [getEvents](/docs/governors/event-governor#getevents)            | Event      | Get all events in a tournament               |
| [getEventData](/docs/governors/publishing-governor#geteventdata) | Publishing | Get event data with draw and matchUp details |

### Draw Queries

| Method                                                                                    | Governor | Context                                  |
| ----------------------------------------------------------------------------------------- | -------- | ---------------------------------------- |
| [findDrawDefinition](/docs/governors/draws-governor#finddrawdefinition)                   | Draws    | Find a draw definition by ID             |
| [isAdHoc](/docs/governors/draws-governor#isadhoc)                                         | Draws    | Check if a draw is ad hoc type           |
| [isValidForQualifying](/docs/governors/draws-governor#isvalidforqualifying)               | Draws    | Check if a structure can have qualifying |
| [getAvailablePlayoffProfiles](/docs/governors/draws-governor#getavailableplayoffprofiles) | Draws    | Get available playoff configurations     |
| [getValidGroupSizes](/docs/governors/draws-governor#getvalidgroupsizes)                   | Draws    | Get valid group sizes for round robin    |

### MatchUp Queries

| Method                                                                        | Governor | Context                                     |
| ----------------------------------------------------------------------------- | -------- | ------------------------------------------- |
| [findMatchUp](/docs/governors/matchup-governor#findmatchup)                   | MatchUp  | Find a matchUp by ID                        |
| [allDrawMatchUps](/docs/governors/matchup-governor#alldrawmatchups)           | MatchUp  | Get all matchUps in a draw                  |
| [allEventMatchUps](/docs/governors/matchup-governor#alleventmatchups)         | MatchUp  | Get all matchUps in an event                |
| [allTournamentMatchUps](/docs/governors/query-governor#alltournamentmatchups) | Query    | Get all matchUps in a tournament            |
| [tournamentMatchUps](/docs/governors/query-governor#tournamentmatchups)       | Query    | Get matchUps grouped by status              |
| [matchUpActions](/docs/governors/matchup-governor#matchupactions)             | MatchUp  | Get available actions for a matchUp         |
| [positionActions](/docs/governors/draws-governor#positionactions)             | Draws    | Get available actions for a draw position   |
| [getMatchUpFormat](/docs/governors/matchup-governor#getmatchupformat)         | MatchUp  | Get the scoring format for a matchUp        |
| [calculateWinCriteria](/docs/governors/matchup-governor#calculatewincriteria) | MatchUp  | Calculate win criteria for a matchUp format |
| [checkScoreHasValue](/docs/governors/score-governor#checkscorehasvalue)       | Score    | Check if a score object has a value         |

### Participant Queries

| Method                                                                          | Governor    | Context                                  |
| ------------------------------------------------------------------------------- | ----------- | ---------------------------------------- |
| [getParticipants](/docs/governors/participant-governor#getparticipants)         | Participant | Get participants with optional filtering |
| [getParticipantStats](/docs/governors/query-governor#getparticipantstats)       | Query       | Get statistics for a participant         |
| [getPredictiveAccuracy](/docs/governors/matchup-governor#getpredictiveaccuracy) | MatchUp     | Get predictive accuracy metrics          |

### Query Draw Generation

| Method                                                                                         | Governor   | Context                                          |
| ---------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------ |
| [generateDrawDefinition](/docs/governors/generation-governor#generatedrawdefinition)           | Generation | Generate a draw (also used as query for preview) |
| [generateAdHocMatchUps](/docs/governors/generation-governor#generateadhocmatchups)             | Generation | Generate matchUps for ad hoc draws               |
| [generateQualifyingStructure](/docs/governors/generation-governor#generatequalifyingstructure) | Generation | Generate a qualifying structure                  |
| [generateFlightProfile](/docs/governors/generation-governor#generateflightprofile)             | Generation | Generate a flight profile                        |
| [generateSeedingScaleItems](/docs/governors/generation-governor#generateseedingscaleitems)     | Generation | Generate seeding scale items                     |
| [drawMatic](/docs/governors/generation-governor#drawmatic)                                     | Generation | DrawMatic draw generation                        |

### Query Positioning

| Method                                                                              | Governor | Context                          |
| ----------------------------------------------------------------------------------- | -------- | -------------------------------- |
| [getPositionAssignments](/docs/governors/draws-governor#getpositionassignments)     | Draws    | Get current position assignments |
| [getEntriesAndSeedsCount](/docs/governors/entries-governor#getentriesandseedscount) | Entries  | Get entry count and seeds count  |
| [getSeedsCount](/docs/governors/draws-governor#getseedscount)                       | Draws    | Get the number of seeds          |
| [getLuckyDrawRoundStatus](/docs/governors/draws-governor)                           | Draws    | Get status of lucky draw rounds  |

### Query Scheduling

| Method                                                                                 | Governor   | Context                    |
| -------------------------------------------------------------------------------------- | ---------- | -------------------------- |
| [getCompetitionDateRange](/docs/governors/tournament-governor#getcompetitiondaterange) | Tournament | Get competition date range |

### Tie Format

| Method                                                      | Governor | Context                                 |
| ----------------------------------------------------------- | -------- | --------------------------------------- |
| [getTieFormat](/docs/governors/query-governor#gettieformat) | Query    | Get the tie format for an event or draw |

### Venue

| Method                                                | Governor | Context            |
| ----------------------------------------------------- | -------- | ------------------ |
| [findVenue](/docs/governors/venue-governor#findvenue) | Venue    | Find a venue by ID |

### Policy / Extensions

| Method                                                                       | Governor | Context                    |
| ---------------------------------------------------------------------------- | -------- | -------------------------- |
| [findPolicy](/docs/governors/policy-governor#findpolicy)                     | Policy   | Find a policy definition   |
| [getPolicyDefinitions](/docs/governors/policy-governor#getpolicydefinitions) | Policy   | Get all policy definitions |
| [findExtension](/docs/governors/query-governor#findextension)                | Query    | Find an extension by name  |

### Query Publishing

| Method                                                                 | Governor   | Context                   |
| ---------------------------------------------------------------------- | ---------- | ------------------------- |
| [getPublishState](/docs/governors/publishing-governor#getpublishstate) | Publishing | Get current publish state |

### Query Scoring

| Method                                                                | Governor | Context                                               |
| --------------------------------------------------------------------- | -------- | ----------------------------------------------------- |
| [parseScoreString](/docs/governors/score-governor#parsescorestring)   | Score    | Parse a score string into a score object              |
| [setMatchUpStatus](/docs/governors/matchup-governor#setmatchupstatus) | MatchUp  | Set matchUp score (also used as query for validation) |

### Teams

| Method                                                                                                            | Governor    | Context                                       |
| ----------------------------------------------------------------------------------------------------------------- | ----------- | --------------------------------------------- |
| [createTeamsFromParticipantAttributes](/docs/governors/participant-governor#createteamsfromparticipantattributes) | Participant | Auto-create team participants from attributes |

### Category

| Method                                                                                 | Governor   | Context                                 |
| -------------------------------------------------------------------------------------- | ---------- | --------------------------------------- |
| [setTournamentCategories](/docs/governors/tournament-governor#settournamentcategories) | Tournament | Set categories on the tournament record |

---

## Other Engine Calls

### competitionEngine

| Method                                                                                      | Governor   | Context                                    |
| ------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------ |
| [competitionScheduleMatchUps](/docs/governors/matchup-governor#competitionschedulematchups) | MatchUp    | Get scheduled matchUps across tournaments  |
| [getCompetitionDateRange](/docs/governors/tournament-governor#getcompetitiondaterange)      | Tournament | Get the date range of the competition      |
| [getTournamentInfo](/docs/governors/tournament-governor#gettournamentinfo)                  | Tournament | Get tournament info via competition engine |
| [getVenuesAndCourts](/docs/governors/venue-governor#getvenuesandcourts)                     | Venue      | Get all venues and courts                  |
| [proConflicts](/docs/governors/schedule-governor#proconflicts)                              | Schedule   | Get scheduling conflicts for pro events    |

### scaleEngine

| Method                                                         | Governor    | Context                                |
| -------------------------------------------------------------- | ----------- | -------------------------------------- |
| [generateDynamicRatings](/docs/governors/participant-governor) | Participant | Generate dynamic ratings across events |
| setState                                                       | Engine      | Load state into scale engine           |

### mocksEngine

| Method                                                                              | Governor | Context                           |
| ----------------------------------------------------------------------------------- | -------- | --------------------------------- |
| [generateTournamentRecord](/docs/governors/mocks-governor#generatetournamentrecord) | Mocks    | Generate a mock tournament record |

### scoreGovernor (direct calls)

| Method                                                                    | Governor | Context                         |
| ------------------------------------------------------------------------- | -------- | ------------------------------- |
| [checkScoreHasValue](/docs/governors/score-governor#checkscorehasvalue)   | Score    | Check if a score has a value    |
| [generateScoreString](/docs/governors/score-governor#generatescorestring) | Score    | Generate a display score string |
| [keyValueScore](/docs/governors/score-governor#keyvaluescore)             | Score    | Key-value based score entry     |

### queryGovernor (direct calls)

| Method                                                                        | Governor | Context                            |
| ----------------------------------------------------------------------------- | -------- | ---------------------------------- |
| [allTournamentMatchUps](/docs/governors/query-governor#alltournamentmatchups) | Query    | Get all tournament matchUps        |
| [compareTieFormats](/docs/governors/query-governor#comparetieformats)         | Query    | Compare two tie format definitions |

### publishingGovernor (direct calls)

| Method                                                                 | Governor   | Context                                  |
| ---------------------------------------------------------------------- | ---------- | ---------------------------------------- |
| [getPublishState](/docs/governors/publishing-governor#getpublishstate) | Publishing | Get publish state directly from governor |

### globalState

| Method                                          | Documentation | Context                              |
| ----------------------------------------------- | ------------- | ------------------------------------ |
| [getDevContext](/docs/engines/global-state)     | Global State  | Get development context flag         |
| [setDevContext](/docs/engines/global-state)     | Global State  | Set development context flag         |
| [setSubscriptions](/docs/engines/subscriptions) | Subscriptions | Register topic subscription handlers |

### tools

| Method                                        | Documentation | Context                                      |
| --------------------------------------------- | ------------- | -------------------------------------------- |
| [createMap](/docs/tools/tools-api)            | Tools         | Create a keyed map from an array             |
| [dateTime](/docs/tools/tools-api)             | Tools         | Date/time utilities                          |
| [definedAttributes](/docs/tools/tools-api)    | Tools         | Filter out undefined attributes              |
| [extractAttributes](/docs/tools/tools-api)    | Tools         | Extract specific attributes from objects     |
| [generateDateRange](/docs/tools/tools-api)    | Tools         | Generate an array of dates in a range        |
| [generateRange](/docs/tools/tools-api)        | Tools         | Generate a numeric range array               |
| [intersection](/docs/tools/tools-api)         | Tools         | Array intersection                           |
| [isConvertableInteger](/docs/tools/tools-api) | Tools         | Check if a value can be converted to integer |
| [isNumeric](/docs/tools/tools-api)            | Tools         | Check if a value is numeric                  |
| [JSON](/docs/tools/tools-api)                 | Tools         | JSON utilities                               |
| [makeDeepCopy](/docs/tools/make-deep-copy)    | Tools         | Deep copy with circular reference handling   |
| [matchUpScheduleSort](/docs/tools/tools-api)  | Tools         | Sort matchUps by schedule                    |
| [nextPowerOf](/docs/tools/tools-api)          | Tools         | Get next power of 2                          |
| [structureSort](/docs/tools/structure-sort)   | Tools         | Sort structures by stage/order               |
| [unique](/docs/tools/tools-api)               | Tools         | Deduplicate an array                         |
| [UUID](/docs/tools/tools-api)                 | Tools         | Generate a UUID                              |
| [UUIDS](/docs/tools/tools-api)                | Tools         | Generate multiple UUIDs                      |

---

## Competition Factory Server Methods

The server uses a focused subset of factory methods for mutation execution and query serving.

### Engines

| Method      | Documentation                                      | Context                                              |
| ----------- | -------------------------------------------------- | ---------------------------------------------------- |
| asyncEngine | [Mutation Engines](/docs/engines/mutation-engines) | Create async mutation engine (per-request isolation) |
| askEngine   | [State Engines](/docs/engines/state-engines)       | Query engine with importMethods support              |

### Mutation Engine

| Method         | Documentation                                      | Context                                 |
| -------------- | -------------------------------------------------- | --------------------------------------- |
| setState       | [State Engines](/docs/engines/state-engines)       | Load tournament records into engine     |
| executionQueue | [Mutation Engines](/docs/engines/mutation-engines) | Execute a batch of mutations atomically |
| getState       | [State Engines](/docs/engines/state-engines)       | Retrieve current engine state           |

### Query Methods (via askEngine)

| Method                                                                                       | Governor    | Context                              |
| -------------------------------------------------------------------------------------------- | ----------- | ------------------------------------ |
| [getTournamentInfo](/docs/governors/tournament-governor#gettournamentinfo)                   | Tournament  | Get tournament summary for responses |
| [getEventData](/docs/governors/publishing-governor#geteventdata)                             | Publishing  | Get event data for publishing        |
| [getParticipants](/docs/governors/participant-governor#getparticipants)                      | Participant | Get participants for responses       |
| [getTournamentPublishStatus](/docs/governors/publishing-governor#gettournamentpublishstatus) | Publishing  | Get full publish status              |
| [competitionScheduleMatchUps](/docs/governors/matchup-governor#competitionschedulematchups)  | MatchUp     | Get scheduled matchUps               |

### Governors (direct usage)

| Method                                                                              | Governor                                  | Context                               |
| ----------------------------------------------------------------------------------- | ----------------------------------------- | ------------------------------------- |
| [generateTournamentRecord](/docs/governors/mocks-governor#generatetournamentrecord) | Mocks                                     | Generate mock tournaments for testing |
| reportGovernor methods                                                              | [Report](/docs/governors/report-governor) | Merged into query engine              |

### Server globalState

| Method                                                | Documentation | Context                                |
| ----------------------------------------------------- | ------------- | -------------------------------------- |
| [setStateMethods](/docs/engines/global-state)         | Global State  | Set custom state methods               |
| [setStateProvider](/docs/engines/global-state)        | Global State  | Set state provider for async isolation |
| [setGlobalSubscriptions](/docs/engines/subscriptions) | Subscriptions | Register global subscriptions          |
| [setSubscriptions](/docs/engines/subscriptions)       | Subscriptions | Register topic subscriptions           |

### Server tools

| Method                          | Documentation | Context            |
| ------------------------------- | ------------- | ------------------ |
| [unique](/docs/tools/tools-api) | Tools         | Deduplicate arrays |
| [UUID](/docs/tools/tools-api)   | Tools         | Generate UUIDs     |

### Constants

| Constant                                           | Module                                         | Values                                 |
| -------------------------------------------------- | ---------------------------------------------- | -------------------------------------- |
| `MISSING_TOURNAMENT_RECORD`                        | `factoryConstants` / `errorConditionConstants` | Error condition for missing tournament |
| `SINGLES`                                          | `eventConstants`                               | Event type constant                    |
| `PUBLISH_EVENT`, `UNPUBLISH_EVENT`                 | `topicConstants`                               | Publish/unpublish event topics         |
| `PUBLISH_ORDER_OF_PLAY`, `UNPUBLISH_ORDER_OF_PLAY` | `topicConstants`                               | Order of play topics                   |
| `PUBLISH_PARTICIPANTS`, `UNPUBLISH_PARTICIPANTS`   | `topicConstants`                               | Participant publishing topics          |
| `UNPUBLISH_TOURNAMENT`                             | `topicConstants`                               | Tournament unpublish topic             |
| `MODIFY_TOURNAMENT_DETAIL`                         | `topicConstants`                               | Tournament detail modification topic   |

### Fixtures

| Fixture                  | Path                | Context                                     |
| ------------------------ | ------------------- | ------------------------------------------- |
| `POLICY_PRIVACY_DEFAULT` | `fixtures.policies` | Default privacy policy for participant data |

### Types

| Type         | Context                               |
| ------------ | ------------------------------------- |
| `Tournament` | TypeScript type for tournament record |
