---
title: Introduction to Policies
---

Policies determine how the various Competition Factory engines function and can shape the way that results are returned. Policies can be attached to the `tournamentRecord`, `events`, or to `drawDefinitions` within an `event`. They can also be passed directly into some factory methods; e.g. a **Participant Policy** can be passed into a method which returns particpipants and filter out attributes which are not to be displayed.

The structure of a **_policyDefinitions_** object is as follows:

```json
{
  [policyType]: {      // e.g. 'seeding' or 'avoidance'
    policyName: 'name'  // for 'seeding' can be the provider of the policy, e.g. 'ITF' or 'USTA'
    ...attributes       // attributes relevant to the policyType
  },
  [anotherPolicyType]: {
    policyName: 'name'
    ...attributes
  },
}
```

## Policy Types

- [Avoidance Policy](../policies/avoidance): Can be attached to drawDefinitions to specify the attriubutes by which participants should be separated
- [Participant Policy](../policies/participantPolicy.md) Enables participant details to be filtered to respect privacy concerns
- [Position Actions Policy](../policies/positionActions): Determines valid actions for positions in a draw structure
- [MatchUp Actions Policy](../policies/matchUpActions): Determines valid actions for matchUps (substitutions, penalties, referree, scheduling)
- [Seeding Policy](../policies/seedingPolicy): Sets seeding pattern and thresholds for number of seeds allowed for draw sizes
- [Scheduling Policy](../policies/scheduling): Defines average and rest/recovery times for matchUpFormats, categoryNames, and categoryTypes
- [Round Robin Tally Policy](../policies/tallyPolicy): Configures calculations which determine participant finishing positions
- [Feed-In Policy](../policies/feedInPolicy): Determining the the patterns which direct participants into consolation feed rounds
- [Progression Policy](../policies/progressionPolicy): Configuration related to participant progression, e.g. automatic qualifier placement, double-exit effects
- [Round Naming Policy](../policies/roundNaming): Specifies how rounds of draw structures should be named
- [Scoring Policy](../policies/scoringPolicy): Restricts available matchUpFormats, defines a default and conditions for "ready to score"
- [Voluntary Consolation Policy](../policies/consolationPolicy.md): Specifies `{ winsLimit, finishingRoundLimit }` for voluntary consolation eligibility
- [Competitive Bands](../policies/competitiveBands): Determines thresholds for ROUTINE and COMPETITIVE matches in `getCompetitiveProfile`
- [Draws Policy](/docs/policies/draws): Configures either global or draw-type-specific `drawTypeCoercion`
- [Ranking Policy](../policies/rankingPolicy): Defines how points are awarded for tournament performance
- [Print Policy](../policies/printPolicy): Opaque extension slot for per-tournament print artifact composition (interpreted by consumers)

## When does a policy travel with the record?

Policies divide into two delivery models depending on what they affect:

### Attached-to-record (mutation-time)

Any policy whose values shape the **output of a mutation** must be embedded in the `tournamentRecord` (or `event` / `drawDefinition` / `structure`) as an `APPLIED_POLICIES` extension. The standard mutation flow runs each method twice — once on the server, once on the client after server ack — and both runs must consult the same policy bytes. Reading from any other source (process registry, environment, etc.) risks split-brain state.

Mutation-time policies: `MATCHUP_ACTIONS`, `POSITION_ACTIONS`, `AVOIDANCE`, `SEEDING`, `DRAWS`, `FEED_IN`, `COMPETITION`, `PROGRESSION`, `SCHEDULING`, `ROUND_ROBIN_TALLY`, `SANCTIONING`, `SCORING`, `AUDIT`, `VOLUNTARY_CONSOLATION`, `COMPETITIVE_BANDS`, `PARTICIPANT`.

### Registry-served (query-time)

`RANKING_POINTS` and other display-only policies (`ROUND_NAMING`, `DISPLAY`, `PRIVACY`, `PRINT`) are read at query time and don't drive mutations. They can be served via the in-process `policyRegistry`:

```js
import { policyRegistry, scaleEngine } from 'tods-competition-factory';

// Consumer registers — usually at boot from a GET /policies/catalog response
policyRegistry.register({
  policyType: 'rankingPoints',
  name: 'USTA_JUNIOR_2026',
  version: '2026.01',
  definition: /* fetched from CFS */,
});

// Engines resolve by name when policyDefinitions isn't passed:
scaleEngine.getTournamentPoints({
  tournamentRecord,
  policyName: 'USTA_JUNIOR_2026',
  level: 1,
});
```

The registry is a per-process singleton. Each consumer (TMX, CFS, courthive-rankings) hydrates its own. Federations adopt a policy by POSTing their version to CFS; consumers re-hydrate at next boot. See [POLICY_DELIVERY](https://github.com/CourtHive/Mentat/blob/main/planning/POLICY_DELIVERY.md) for the full architecture.
