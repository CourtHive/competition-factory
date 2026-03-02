---
title: Generation Governor
---

```js
import { generationGovernor } from 'tods-competition-factory';
```

## drawMatic

**drawMatic** is a dynamic round generator for AD_HOC draws which produces participant pairings with previous opponent and team member avoidance.
When `{ scaleName, scaleAccessor }` values are present, participants will be paired for level-based play.

The number of rounds (`roundsCount`) that can be generated is limited to **# participants - 1**, which is the normal size of a Round Robin, unless `{ enableDoubleRobin: true }`, in which case the upper limit is **(# participants - 1) \* 2**.

The number of participants is determined by the number of **entries** or the number of valid `{ participantIds }` provided.

:::info
Inspired by the work of the Constantine who runs spectacular D3 College Tennis events using this format for flexible round generation when teams arrive and depart on different days.
:::

```js
const { matchUps, participantIdPairings, iterations, candidatesCount, modifiedScaleValues } = engine.drawMatic({
  restrictRoundsCount, // optional boolean defaults to true; set to false for unlimited roundsCount
  restrictEntryStatus, // optional - only allow STRUCTURE_SELECTED_STATUSES
  enableDoubleRobin, // optional - allows roundsCount <= (drawSize - 1) * 2
  generateMatchUps, // optional - defaults to true; when false only returns { participantIdPairings }
  minimizeDelta, // boolean - force minimum delta in ratings; good for first round
  participantIds, // optional array of [participantId] to restrict enteredParticipantIds which appear in generated round
  maxIterations, // optional - defaults to 5000; can be used to set a limit on processing overhead
  structureId, // optional; if no structureId is specified find the latest AD_HOC stage which has matchUps
  matchUpIds, // optional array of uuids to be used when generating matchUps
  eventType, // optional - override eventType of event within which draw appears; e.g. to force use of SINGLES ratings in DOUBLES events

  updateParticipantRatings, // optional boolean; attach modifiedScaleValues to participants
  dynamicRatings, // optional boolean - generate dynamic ratings from previous round results
  refreshDynamic, // optional boolean - ignore previously generated dynamic values
  scaleAccessor, // optional - string to access value within scaleValue, e.g. 'wtnRating'
  scaleName, // optional - custom rating name to seed dynamic ratings

  roundsCount, // REQUIRED - number of rounds to generate; limited to (1 - drawSize) unless { enableDoubleRobin: true }
  drawId, // REQUIRED - drawId for which matchUps will be generated
});
```

---

## generateAdHocMatchUps

Draws with `{ drawType: AD_HOC }` allow `matchUps` to be dynamically added. In this type of draw there is no automatic participant progression between rounds. Participant assignment to `matchUps` is done manually, or via **drawMatic**. The only restriction is that a participant may appear once per round.

```js
const { matchUps } = engine.generateAdHocMatchUps({
  restrictMatchUpsCount, // optional boolean defaults to true; set to false for unlimited matchUpsCount
  participantIdPairings, // optional - array of array of pairings [['id1', 'id2'], ['id3', 'id4']]
  matchUpsCount, // optional - number of matchUps to generate; defaults to calc from entries
  roundNumber, // optional - specify round for which matchUps will be generated
  structureId, // required only if there is more than one structure
  matchUpIds, // optional - if matchUpIds are not specified UUIDs are generated
  newRound, // optional - boolean defaults to false - whether to auto-increment to next roundNumber
  drawId, // required - drawId of drawDefinition in which target structure is found
});
```

---

## generateAdHocRounds

```js
const { matchUps } = engine.generateAdHocRounds({
  restrictMatchUpsCount, // optional boolean defaults to true; set to false for unlimited matchUpsCount
  restrictRoundsCount, // optional boolean defaults to true; set to false for unlimited roundsCount
  enableDoubleRobin, // optional - allows roundsCount <= (drawSize - 1) * 2
  matchUpsCount, // optional - number of matchUps to generate per round; defaults to calc from entries
  roundNumber, // optional - specify round for which matchUps will be generated
  structureId, // required only if there is more than one structure
  roundsCount, // defaults to 1
  matchUpIds, // optional - if matchUpIds are not specified UUIDs are generated
  newRound, // optional - boolean defaults to false - whether to auto-increment to next roundNumber
  drawId, // required - drawId of drawDefinition in which target structure is found
});
```

---

## generateAndPopulatePlayoffStructures

Generates values but does not attach them to the `drawDefinition`. Used in conjunction with `attachPlayoffStructures`.

```js
const { structures, links, matchUpModifications } = engine.generateAndPopulatePlayoffStructures({
  requireSequential, // boolean defaults to true; only applies to Round Robin; require finishingPositions to be sequential
  roundNumbers: [3], // optional if playoffPositions not provided; roundNumbers of structure to be played off.
  roundProfiles, // optional - source roundNumbers as Object.keys with depth as Object.values, e.g. [{ 1: 2}, {2: 1}]
  playoffPositions: [3, 4], // optional if roundNumbers not provided; finishing positions to be played off.
  playoffStructureNameBase, // optional - Root word for default playoff naming, e.g. 'Playoff' for 'Playoff 3-4'
  exitProfileLimit, // limit playoff rounds generated by the attributes present in playoffAttributes
  playoffAttributes, // optional - mapping of either exitProfile or finishingPositionRange to structure names (see Finishing Positions concept)
  playoffGroups, // optional - only applies to Playoffs from ROUND_ROBIN: { structureNameMap: {}, finishingPositions: [], drawType: '' }
  structureId,
  drawId,
});
```

---

## generateDrawDefinition

This is a convenience method which handles most use cases for draw generation. See examples in [Basic Usage](../concepts/draws-overview.mdx#basic-usage), [Avoidance Policies](../concepts/accessors.mdx#avoidance-policies), [Nationality-Based Draws](../concepts/accessors.mdx#nationality-based-draws), [Pre-Defined Draw Types](../concepts/draw-types.md#pre-defined-draw-types), [Manual Entry Selection](../concepts/events/entries.mdx#manual-entry-selection), and 4 more.

The `automated` parameter is "truthy" and supports placing only seeded participants and any byes which are adjacent to seeded positions.
Support for this scenario is provided to enable some unique positioning strategies where unseeded participants have some agency in the selection process.

```js
const drawDefinitionValues = {
  eventId, // optional - used to find any avoidance policies to be applied
  drawSize, // number of drawPositions in the first draw structure
  drawType, // optional - defaults to SINGLE_ELIMINATION
  drawName, // cutom name for generated draw structure(s)
  drawEntries, // array of entries, equal to or a subset of event.entries
  automated, // optional - whether or not to automatically place participants in structures; true/false or 'truthy' { seedsOnly: true }
  matchUpType, // optional - SINGLES, DOUBLES, or TEAM
  matchUpFormat, // optional - default matchUpFormatCode for all contained matchUps
  playoffMatchUpFormat, // optional - relevant for ROUND_ROBIN_WITH_PLAYOFF
  hydrateCollections, // optional - propagate { category, gender } for event to collectionDefinitions in tieFormats
  tieFormat, // optional - { collectionDefinitions, winCriteria } for 'dual' or 'tie' matchUps
  seedsCount, // optional - number of seeds to generate if no seededParticipants provided
  seededParticipants, // optional - { participantId: 'id', seedNumber: 1, seedValue, '1' }
  seedingScaleName, // optional - custom scale for determining seeded participants

  // { positioing: WATERFALL } seeding for ROUND_ROBIN structures
  // { positioning: CLUSTER } or { positioning: SEPARATE } seeding for elimination structures
  // { groupSeedingThreshold: 5 } will set seedValue to lowest value within all groups where seedNumber is > 5
  seedingProfile, // optional { positioning, groupSeedingThreshold }

  qualifyingPlaceholder, // optional boolean - generate a placeholder qualifying structure if qualifiersCount and no qualifyingProfiles
  qualifiersCount, // optional - how many positionsAssignments will have { qualifier: true }
  qualifyingOnly, // optional boolean - ignore event.entries that are not entryStage: QUALIFYING
  qualifyingProfiles, // optional array [{ roundTarget, structureProfiles: [{ drawSize, seedsCount, seedingScaleName, qualifyingPositions }]}]

  structureOptions: {
    // optional - for ROUND_ROBIN - { groupSize, playoffGroups }
    groupSize, // e.g. 4 participants per group
    groupSizeLimit: 8,
    playoffGroups: [
      { finishingPositions: [1], structureName: 'Gold Flight', drawType }, // drawype defaults to SINGLE_ELIMINATION
      { finishingPositions: [2], structureName: 'Silver Flight', drawType }, // drawType can also be COMPASS or FIRST_MATCH_LOSER_CONSOLATION
    ],
  },

  withPlayoffs, // optional - add playoff structures from the MAIN structure; supports recursive nesting (see below)

  staggeredEntry, // optional - accepts non-base-2 drawSizes and generates feed arms for "extra" drawPositions
  policyDefinitions, // optional - seeding or avoidance policies to be used when placing participants
  qualifyingPositions, // optional - number of positions in draw structure to be filled by qualifiers
  playoffAttributes, // optional - map of { [finishingPositionRange || exitProfile]: { name: 'customName', abbreviation: 'A' } }
  enforcePolicyLimits, // optional boolean - defaults to true - constrains seedsCount to policyDefinition limits
  voluntaryConsolation, // optional { structureName, structureAbbreviation } - causes voluntary consolation structure to be added
  enforceMinimumDrawSize, // optional boolean - defaults to true - false will allow generation of multi-structure drawTypes with only 2 participants
  drawTypeCoercion, // optional boolean - coerce multi-structure drawTypes to SINGLE_ELIMINATION for drawSize: 2
  ignoreStageSpace, // optional boolean - ignore wildcards count & etc.

  compassAttributes, // optional - provide translations for name mappings
  olympicAttributes, // optional - provide translations for name mappings
};

const { drawDefinition } = engine.generateDrawDefinition(drawDefinitionValues);
```

### withPlayoffs — Recursive Playoff Generation {#withplayoffs}

The `withPlayoffs` parameter adds PLAY_OFF structures linked to the MAIN structure via LOSER links.
It supports arbitrary nesting through the `roundPlayoffs` field, enabling custom topologies like COMPASS draws
to be built in a single `generateDrawDefinition()` call.

**Type: `WithPlayoffsArgs`**

```ts
type WithPlayoffsArgs = {
  roundProfiles?: { [key: number]: number }[]; // source round → depth, e.g. [{ 1: 1 }, { 2: 1 }]
  playoffAttributes?: PlayoffAttributes; // naming for generated structures
  playoffStructureNameBase?: string;
  addNameBaseToAttributeName?: boolean;
  finishingPositionNaming?: any;
  finishingPositionLimit?: number;
  playoffPositions?: number[];
  roundOffsetLimit?: number;
  exitProfileLimit?: boolean;
  roundNumbers?: number[];

  // Recursive child playoffs keyed by source round number.
  // Each entry defines sub-playoffs for the structure created
  // from that round's losers at the current level.
  roundPlayoffs?: {
    [roundNumber: number]: WithPlayoffsArgs;
  };
};
```

**Simple example** — 3rd/4th place playoff from semifinal losers:

```js
const { drawDefinition } = engine.generateDrawDefinition({
  drawSize: 16,
  withPlayoffs: {
    roundProfiles: [{ 4: 1 }],
    playoffAttributes: {
      '0-4': { name: 'Bronze Medal Match', abbreviation: 'BM' },
    },
  },
});
```

**Recursive example** — full COMPASS topology (8 structures, 7 LOSER links) in one call:

```js
const { drawDefinition } = engine.generateDrawDefinition({
  drawSize: 32,
  drawType: 'SINGLE_ELIMINATION',
  drawName: 'East',
  withPlayoffs: {
    roundProfiles: [{ 1: 1 }, { 2: 1 }, { 3: 1 }],
    playoffAttributes: {
      '0-1': { name: 'West', abbreviation: 'W' },
      '0-2': { name: 'North', abbreviation: 'N' },
      '0-3': { name: 'Northeast', abbreviation: 'NE' },
    },
    roundPlayoffs: {
      1: {
        // West's children
        roundProfiles: [{ 1: 1 }, { 2: 1 }],
        playoffAttributes: {
          '0-1': { name: 'South', abbreviation: 'S' },
          '0-2': { name: 'Southwest', abbreviation: 'SW' },
        },
        roundPlayoffs: {
          1: {
            // South's children
            roundProfiles: [{ 1: 1 }],
            playoffAttributes: {
              '0-1': { name: 'Southeast', abbreviation: 'SE' },
            },
          },
        },
      },
      2: {
        // North's children
        roundProfiles: [{ 1: 1 }],
        playoffAttributes: {
          '0-1': { name: 'Northwest', abbreviation: 'NW' },
        },
      },
    },
  },
});

// Result: 8 structures (East, West, North, South, NE, NW, SE, SW)
//         7 LOSER links connecting them
//         72 total matchUps for a 32-draw COMPASS
```

**How it works internally:**

1. `addPlayoffStructures()` is called for the top-level `withPlayoffs` against the MAIN structure
2. The algorithm snapshots existing LOSER links from the source structure before the call
3. After `addPlayoffStructures()` returns, the newly created LOSER links are identified by diffing
4. For each entry in `roundPlayoffs`, the matching new link's target `structureId` is found
5. The process recurses into the child `WithPlayoffsArgs` using that target structureId

This approach works because `addPlayoffStructures()` mutates `drawDefinition.links` in place
(via `attachPlayoffStructures`), so each recursive level can discover what was just created.

Custom topologies are also supported — you don't need to build a full COMPASS. For example,
a 6-structure partial COMPASS (no Southwest or Southeast) is simply a tree without those branches:

```js
withPlayoffs: {
  roundProfiles: [{ 1: 1 }, { 2: 1 }, { 3: 1 }],
  playoffAttributes: {
    '0-1': { name: 'West', abbreviation: 'W' },
    '0-2': { name: 'North', abbreviation: 'N' },
    '0-3': { name: 'Northeast', abbreviation: 'NE' },
  },
  roundPlayoffs: {
    1: {
      roundProfiles: [{ 1: 1 }],
      playoffAttributes: { '0-1': { name: 'South', abbreviation: 'S' } },
    },
    2: {
      roundProfiles: [{ 1: 1 }],
      playoffAttributes: { '0-1': { name: 'Northwest', abbreviation: 'NW' } },
    },
  },
}
```

See also: [Custom Playoff Topologies](../concepts/draw-types.md#custom-playoff-topologies), [addPlayoffStructures](/docs/governors/draws-governor#addplayoffstructures)

---

## generateDrawMaticRound

Typically not called directly. `engine.drawMatic` is a higher level wrapper which automates derivation of `adHocRatings`.

```js
const {
  participantIdPairings,
  candidatesCount,
  iterations,
  matchUps,
  success,
} = generateDrawMaticRound({
  maxIterations,// optional - defaults to 5000
  generateMatchUps = true, // optional - defaults to true; when false only returns { participantIdPairings }
  participantIds, // required
  adHocRatings, // optional { ['participantId']: numericRating }
  structureId, // required
  matchUpIds, // optional array of uuids to be used when generating matchUps
  eventType, // optional - override eventType of event within which draw appears; e.g. to force use of SINGLES ratings in DOUBLES events
  drawId, // required
});
```

---

## generateDrawStructuresAndLinks

Low-level method that generates structures and links for various draw types. Typically called internally by `generateDrawDefinition`.

```js
const { structures, links } = engine.generateDrawStructuresAndLinks({
  drawDefinition, // required - target drawDefinition to modify
  drawType, // required - SINGLE_ELIMINATION, ROUND_ROBIN, etc.
  drawSize, // required - number of draw positions
  structureName, // optional - custom name for main structure
  matchUpType, // optional - SINGLES, DOUBLES, TEAM
  tieFormat, // optional - for TEAM matchUps
  qualifyingProfiles, // optional - array of qualifying structure configs
  staggeredEntry, // optional - allows non-power-of-2 drawSizes
  playoffAttributes, // optional - playoff structure naming
  appliedPolicies, // optional - seeding/avoidance policies
  enforceMinimumDrawSize, // optional boolean - defaults to true
  drawTypeCoercion, // optional boolean - coerce to SINGLE_ELIMINATION for drawSize: 2
  overwriteExisting, // optional boolean - replace existing structures
  uuids, // optional - array of UUIDs for structures/matchUps
});
```

**Returns:**

```ts
{
  structures: Structure[];  // Generated structure objects
  links: DrawLink[];        // Generated link objects (for multi-stage draws)
  error?: ErrorType;
}
```

**Purpose:** Core method for generating draw structures. Handles all draw type logic including:

- Single elimination brackets
- Round robin groups
- Consolation structures
- Qualifying structures
- Playoff structures
- Feed-in and staggered entry

**Notes:**

- Used internally by `generateDrawDefinition`
- Does not attach structures to drawDefinition (returns them for manual attachment)
- Handles complex multi-structure draw types (Curtis, FMLC, Compass, etc.)
- Validates draw size and structure compatibility

---

## generateDrawTypeAndModifyDrawDefinition

Generates draw structures and directly modifies the drawDefinition. Higher-level than `generateDrawStructuresAndLinks`.

```js
const { drawDefinition, matchUpsMap } = engine.generateDrawTypeAndModifyDrawDefinition({
  drawDefinition, // required - drawDefinition to modify
  drawType, // required - draw type to generate
  drawSize, // required - number of draw positions
  matchUpType, // optional - SINGLES, DOUBLES, TEAM
  matchUpFormat, // optional - default matchUpFormat
  tieFormat, // optional - for TEAM matchUps
  structureOptions, // optional - { groupSize, playoffGroups } for ROUND_ROBIN
  qualifiersCount, // optional - number of qualifier positions
  qualifyingOnly, // optional boolean - only process QUALIFYING stage entries
  stageSequence, // optional - target specific stage (1=QUALIFYING, 2=MAIN)
  drawTypeCoercion, // optional boolean - coerce to SINGLE_ELIMINATION for small draws
  modifyOriginal, // optional boolean - defaults to true
  policyDefinitions, // optional - seeding/avoidance policies
  isMock, // optional boolean - for testing
});
```

**Returns:**

```ts
{
  drawDefinition: DrawDefinition;      // Modified drawDefinition
  inContextDrawMatchUps?: MatchUp[];  // All matchUps with context
  matchUpsMap?: MatchUpsMap;          // Map of matchUpIds to matchUp objects
  error?: ErrorType;
}
```

**Difference from generateDrawStructuresAndLinks:**

- `generateDrawTypeAndModifyDrawDefinition` modifies the drawDefinition directly
- `generateDrawStructuresAndLinks` returns structures/links for manual attachment
- This method also generates tieMatchUps for TEAM events
- Handles stage-specific modifications (QUALIFYING vs MAIN)
- Returns complete matchUpsMap and inContext matchUps

**When to Use:**

- Modifying existing draws (changing draw type)
- Regenerating structures after entry changes
- Testing draw modifications
- Building custom draw generation workflows

**Notes:**

- Validates tieFormat for TEAM matchUps
- Generates links between structures automatically
- Notifies subscribers of draw modifications
- Use `modifyOriginal: false` to get modified copy without changing input

---

## generateFlightProfile

Splits event entries into `flightsCount` (# of draws). `flightProfile` is an extension on an event which contains attributes to be used by `generateDrawDefinition`. See examples: [Generating Flight Profiles](../concepts/events/flights.mdx#generating-flight-profiles), [Update Existing Profile](../concepts/events/flights.mdx#update-existing-profile), [Complete Example](../concepts/events/flights.mdx#complete-example).

NOTE: The method returns `{ flightProfile, splitEntries }` for testing; `splitEntries` provides a breakdown on how `event.entries` were split across each `flight` within the `event`.

For an explanation of `scaleAttributes` see [Scale Items](../concepts/scaleItems).

```js
const scaleAttributes = {
  scaleType: RATING,
  eventType: SINGLES,
  scaleName: 'WTN',
  accessor, // optional - string determining how to access attribute if scaleValue is an object
};

const { flightProfile, splitEntries } = engine.generateFlightProfile({
  eventId, // event for which entries will be split
  attachFlightProfile, // boolean - also attach to event after generation
  scaledEntries, // optional - overrides the use of scaleAttributes, scaleSortMethod, and sortDescending
  scaleAttributes, // defines participant sort method prior to split
  scaleSortMethod, // optional - function(a, b) {} sort method, useful when scaleValue is an object or further proessing is required
  sortDescending, // optional - default sorting is ASCENDING; only applies to default sorting method.
  flightsCount: 3, // number of draws to be created
  deleteExisting: true, // optional - remove existing flightProfile
  splitMethod: SPLIT_WATERFALL, // optional - defaults to SPLIT_LEVEL_BASED
  drawNames: ['Green Flight', 'Blue Flight'], // optional
  drawNameRoot: 'Flight', // optional - used to generate drawNames, e.g. 'Flight 1', 'Flight 2'
});

const {
  flights: [
    {
      drawId, // unique identifier for generating drawDefinitions
      drawName, // custom name for generated draw
      drawEntries, // entries allocated to target draw
    },
  ],
} = flightProfile;

// use flight information to generate drawDefinition
const {
  flights: [flight],
} = flightProfile;

Object.assign(drawDefinitionValues, flight);
const { drawDefinition } = engine.generateDrawDefinition(drawDefinitionValues);
```

---

## generateLineUps

Generates lineUps for TEAM events which have selected teams with ranked or rated individualParticipants. Individual TEAM participants are assigned line positions based on the scale specified.

```js
const scaleAccessor = {
  scaleName: categoryName,
  scaleType: RANKING,
  sortOrder, // optional - ASCENDING or DESCENDING - defaults to ASCENDING
};
const { lineUps, participantsToAdd } = engine.generateLineUps({
  useDefaultEventRanking, // optional boolen; when true scaleAccessor is not required
  scaleAccessor, // see above
  singlesOnly, // optional boolean - when true SINGLES rankings will be used for DOUBLES position assignment
  attach, // optional boolean - when true the lineUps will be attached to the drawDefinition specified by drawId
  drawId,
});
```

---

## generateQualifyingStructure

```js
let { structure, link } = engine.generateQualifyingStructure({
  targetStructureId, // required: structure for which participants will qualify
  qualifyingPositions, // optional: specify the # of qualifyingPositions
  qualifyingRoundNumber, // optional: determine qualifyingPositions by # of matchUps in specified round; does not apply to ROUND_ROBIN
  structureOptions, // optional: specific to ROUND_ROBIN generation
  structureName, // optional
  drawSize,
  drawType, // optional: defaults to SINGLE_ELIMINATION
  drawId, // required: draw within which target structure appears
});
```

---

## generateSeedingScaleItems

Used in conjunction with `getEntriesAndSeedsCount` when it is necessary to make use of a custom function for generating `scaledEntries`. See examples: [Client-Implemented Seeding](../concepts/scaleItems.md#client-implemented-seeding), [Using Factory getScaledEntries()](../concepts/scaleItems.md#using-factory-getscaledentries).

```js
const { scaleItemsWithParticipantIds } = engine.generateSeedingScaleItems({
  scaleAttributes,
  scaledEntries,
  stageEntries,
  seedsCount,
  scaleName,
});
```

**Returns:**

```ts
{
  scaleItemsWithParticipantIds: Array<{
    participantId: string;
    scaleItem: ScaleItem;
  }>;
}
```

**Use Cases:**

- Custom seeding logic that requires manual scale generation
- Converting external rating systems to CODES scale format
- Testing seeding scenarios with specific scale values

---

## generateStatCrew

Generates XML output in StatCrew format for college tennis scoring systems.

```js
const { xml } = engine.generateStatCrew({
  tournamentRecord, // required - tournament to export
});

// Save to file for StatCrew import
fs.writeFileSync('statcrew-export.xml', xml);
```

**Returns:**

```ts
{
  xml: string; // StatCrew-formatted XML
  success: boolean;
}
```

**Purpose:** Export tournament data in StatCrew XML format, which is used by college tennis programs in the United States for official scoring and statistics.

**Features:**

- Exports tournament metadata (name, date, ID)
- Includes all team participants
- Exports singles and doubles matchUps
- Handles TEAM/dual match format
- Distinguishes between tournament and dual match formats
- Maps participant IDs to teams and individuals

**When to Use:**

- College tennis tournaments requiring StatCrew integration
- Exporting data to NCAA systems
- Providing official match results in standardized format

**Notes:**

- Specifically designed for college tennis workflows
- Handles both tournament and dual match formats
- Includes participant and matchUp mappings
- XML format matches StatCrew import specifications

---

## generateVoluntaryConsolation

Generates and optionally attaches a voluntary consolation structure to a draw. Voluntary consolations allow first-round losers to opt into a secondary draw.

```js
const { structures, links } = engine.generateVoluntaryConsolation({
  drawDefinition, // required - target drawDefinition
  tournamentRecord, // required - tournament context
  structureName, // optional - custom name (default: 'Voluntary Consolation')
  automated, // optional boolean - auto-position participants
  applyPositioning, // optional boolean - apply positioning policies
  attachConsolation, // optional boolean - attach to drawDefinition
  placeByes, // optional boolean - place byes automatically
  matchUpType, // optional - SINGLES, DOUBLES, TEAM
  tieFormat, // optional - for TEAM matchUps
  seedingProfile, // optional - seeding strategy for consolation
  playoffAttributes, // optional - playoff structure naming
  staggeredEntry, // optional boolean - allow non-power-of-2 sizes
  isMock, // optional boolean - for testing
});
```

**Returns:**

```ts
{
  structures?: Structure[];  // Generated consolation structures
  links?: DrawLink[];        // Links to main structure
  error?: ErrorType;
}
```

**Purpose:** Creates a consolation draw for first-round losers who opt in voluntarily. Unlike automatic consolations, this requires manual participant selection.

**When to Use:**

- Tournaments with optional consolation draws
- Giving first-round losers a chance to continue playing
- Recreational or participation-focused tournaments
- Testing consolation scenarios

**Notes:**

- Participants must voluntarily opt into the consolation
- Only first-round losers are eligible
- Generated structure is linked to main structure
- Use `attachConsolation: true` to automatically attach to drawDefinition
- Separate from `addVoluntaryConsolationStructure` which manages existing consolations

---

## roundRobinGroups

Utility function for generating round robin matchUp pairings within a group.

```js
const { groupMatchUps, uniqueMatchUpGroupings } = roundRobinGroups({
  drawPositions, // array of draw positions in group (e.g., [1, 2, 3, 4])
});

// Example for 4-person group:
// groupMatchUps: [[1,2], [1,3], [1,4], [2,3], [2,4], [3,4]]
```

**Returns:**

```ts
{
  groupMatchUps: number[][];        // All matchUp pairings
  uniqueMatchUpGroupings: number[][]; // Deduplicated pairings
}
```

**Purpose:** Generate all possible matchUp pairings for round robin groups, ensuring each participant plays every other participant once.

**Internal Use:**

- Called by round robin structure generators
- Used in group stage creation
- Ensures complete round robin schedules

**Notes:**

- Returns all pairings (each matchUp appears twice, once for each participant)
- `uniqueMatchUpGroupings` provides deduplicated list
- Used internally by `generateDrawDefinition` for ROUND_ROBIN draws
- Can be used for custom round robin scheduling logic

---
