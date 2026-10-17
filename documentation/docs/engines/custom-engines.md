---
title: Custom Engines
---

Factory engines carry only their core methods (`setState`, `getState`, `executionQueue` and the
like) until you import the functionality you need. In a bundled client that lets the bundler drop
every governor you never import — see [Bundle Size](#bundle-size) for what that saves, and for the
import pattern that defeats it.

**Benefits:**

- Smaller client bundles, when governors are imported by name
- An explicit, auditable list of the methods an application calls

:::info
The `tournamentEngine` and `competitionEngine` exports are pre-configured engines provided for backwards compatibility with Competition Factory v1.x. They include all governors and methods.
:::

## Engine Lifetimes and Shared State

`syncEngine`, `askEngine` and `matchUpEngine` are each a **singleton**: importing one in several
files returns the same instance. Choosing a different engine type does **not** give you
independent state:

- `syncEngine` and `askEngine` read and write the **same** tournament state — the one installed
  global state provider — and the same method registry. A record loaded through one is visible
  to the other, and methods imported into either are registered for both.
- `askEngine` dispatches without notifications: it never notifies subscribers, takes no
  `rollbackOnError` snapshot and has no `executionQueue`. It does **not** restrict itself to
  queries — it runs whatever method you import or pass, so a mutation imported into it changes
  the shared state silently.
- `matchUpEngine` keeps its **own** matchUp state, separate from the tournament state, but shares
  the process-wide settings (`devContext`, deep-copy configuration).
- `asyncEngine` is a factory function, not a singleton. Each instance reads and writes the state
  the async provider binds to the current execution context — see
  [Mutation Engines](/docs/engines/mutation-engines#asynchronous-state-provider).

Methods imported into an engine accumulate for the life of the process. Configure your custom
engine once at application startup rather than importing methods into it from several places.

:::caution `tournamentEngine` is `syncEngine`
`tournamentEngine` and `competitionEngine` are the same instance as `syncEngine`, with every
governor imported when the module that defines them is evaluated. In Node, or anywhere the
package is loaded without a bundler, that happens on import, so `syncEngine` already carries
every method. A bundler that drops unused modules (the package declares `"sideEffects": false`)
leaves `syncEngine` bare only as long as nothing in the application imports `tournamentEngine`
or `competitionEngine`.
:::

---

## Creating Custom Engines

### Minimal Query Engine

Create an engine with just query methods. Import the governor by **name** from the package root —
see [Bundle Size](#bundle-size) for why `governors.queryGovernor` costs far more:

```js
// queryEngine.ts
import { syncEngine, queryGovernor } from 'tods-competition-factory';

// Import only query methods
syncEngine.importMethods(queryGovernor);

export { syncEngine as queryEngine };
```

**Usage:**

```js
import { queryEngine } from './queryEngine';

queryEngine.setState(tournamentRecord);

// Query methods available
const { participants } = queryEngine.getParticipants();
const { matchUps } = queryEngine.allTournamentMatchUps();

// Not imported, and not otherwise loaded (see the caution above)
queryEngine.addEvent; // undefined
```

---

### Minimal Mutation Engine

Create an engine for specific operations. Import the method from its named governor:

```js
// scoringEngine.ts
import { syncEngine, matchUpGovernor } from 'tods-competition-factory';

// Import only scoring-related mutation methods
syncEngine.importMethods({
  setMatchUpStatus: matchUpGovernor.setMatchUpStatus,
});

export { syncEngine as scoringEngine };
```

**Usage:**

```js
import { scoringEngine } from './scoringEngine';

scoringEngine.setState(tournamentRecord);

const result = scoringEngine.setMatchUpStatus({
  matchUpId: 'match-1',
  outcome: { score: { sets: [{ side1Score: 6, side2Score: 4 }] } },
});
if (result.error) {
  // errors are returned, not thrown
}
```

Use `syncEngine` rather than `askEngine` for mutations: only `syncEngine` (and `asyncEngine`)
notify subscribers and honour `rollbackOnError`.

---

### Importing Nested Methods

The `importMethods` function can traverse nested objects to import all methods:

```js
import { governors, syncEngine } from 'tods-competition-factory';

// Import all methods from all governors (full engine — every governor is bundled)
syncEngine.importMethods(governors, true, 1);
// Parameters: (object, traverse=true, maxDepth=1)

export { syncEngine as fullEngine };
```

**Traversal Parameters:**

- `traverse: false` - Only import methods at the current level
- `traverse: true, maxDepth: 1` - Import from nested objects (1 level deep)
- `traverse: true, maxDepth: 2` - Import from deeply nested objects

---

## Real-World Examples

### Client-Side Scoring App

Minimize bundle for browser-based live scoring. `setState` and `getState` are core engine
methods — every engine has them without importing anything:

```js
// src/engines/clientEngine.ts
import { syncEngine, queryGovernor, matchUpGovernor, scoreGovernor } from 'tods-competition-factory';

// Only import what's needed for live scoring UI
syncEngine.importMethods({
  // Queries for display
  allTournamentMatchUps: queryGovernor.allTournamentMatchUps,
  findMatchUp: matchUpGovernor.findMatchUp,

  // Score entry
  setMatchUpStatus: matchUpGovernor.setMatchUpStatus,

  // Score validation
  validateSetScore: scoreGovernor.validateSetScore,
  validateMatchUpScore: scoreGovernor.validateMatchUpScore,
});

export { syncEngine as clientEngine };
```

---

### Server-Side Tournament Admin API

Full-featured engine for administrative operations:

```js
// src/engines/adminEngine.ts
import { governors, syncEngine } from 'tods-competition-factory';

// Import all governors for full admin capabilities
syncEngine.importMethods(governors, true, 1);

// Add custom admin-only methods
syncEngine.getAdminStats = function () {
  const { participants } = this.getParticipants();
  const { events } = this.getEvents();
  const { venues } = this.getVenuesAndCourts();
  return {
    participantCount: participants?.length || 0,
    eventCount: events?.length || 0,
    venueCount: venues?.length || 0,
  };
};

export { syncEngine as adminEngine };
```

---

### Microservice-Specific Engines

Create engines tailored to specific microservices:

```js
// scheduling-service/engine.ts - Only scheduling methods
import { syncEngine, queryGovernor, scheduleGovernor } from 'tods-competition-factory';

syncEngine.importMethods({
  // Queries
  allTournamentMatchUps: queryGovernor.allTournamentMatchUps,
  getVenuesAndCourts: queryGovernor.getVenuesAndCourts,

  // Scheduling mutations
  bulkScheduleTournamentMatchUps: scheduleGovernor.bulkScheduleTournamentMatchUps,
  scheduleMatchUps: scheduleGovernor.scheduleMatchUps,
  clearScheduledMatchUps: scheduleGovernor.clearScheduledMatchUps,
});

export { syncEngine as schedulingEngine };
```

```js
// draw-generation-service/engine.ts - Only draw generation
// Use syncEngine singleton configured once at startup
import { syncEngine, eventGovernor, generationGovernor, drawsGovernor } from 'tods-competition-factory';

syncEngine.importMethods({
  addEvent: eventGovernor.addEvent,
  generateDrawDefinition: generationGovernor.generateDrawDefinition,
  automatedPositioning: drawsGovernor.automatedPositioning,
});

export { syncEngine as drawEngine };
```

---

## Method Import Patterns

### Selective Import (Recommended)

Explicitly list needed methods for maximum control:

```js
import { syncEngine, queryGovernor, eventGovernor } from 'tods-competition-factory';

syncEngine.importMethods({
  getParticipants: queryGovernor.getParticipants,
  addEvent: eventGovernor.addEvent,
});
```

**Pros:**

- Retains at most the governors you name
- Clear dependencies
- Easy to audit what's included

**Cons:**

- More verbose
- Must update when adding features

### Governor Import

Import entire governor for related functionality:

```js
import { syncEngine, queryGovernor, eventGovernor } from 'tods-competition-factory';

// Import all query methods
syncEngine.importMethods(queryGovernor);

// Import all event methods
syncEngine.importMethods(eventGovernor);
```

**Pros:**

- Related methods grouped
- Less maintenance

**Cons:**

- Includes every method of each governor imported

### Full Import

Import everything for maximum flexibility:

```js
syncEngine.importMethods(governors, true, 1);
```

**Pros:**

- All functionality available
- No method missing errors
- Fastest development

**Cons:**

- Largest bundle size
- Includes unused code

---

## TypeScript Support

`syncEngine` is typed `FactoryEngine`, which is an open record (`{ [key: string]: any }`). Importing
a subset of methods does not narrow that type: an unimported method is **not** a TypeScript error,
and calling one fails only at runtime. To get typed signatures, cast to `FactoryEngineTyped` — but
that type describes the **full** engine surface, every method `tournamentEngine` carries, so it does
not reflect a selective import either.

```ts
import { syncEngine, queryGovernor } from 'tods-competition-factory';
import type { FactoryEngineTyped } from 'tods-competition-factory';

syncEngine.importMethods(queryGovernor);

export const queryEngine = syncEngine as FactoryEngineTyped;

queryEngine.getParticipants(); // typed
queryEngine.addEvent({}); // also typed — the type does not know what was imported
```

---

## Bundle Size

Measured together from the build at `133cbb00` (2026-10-17, post-7.15 dev), on Node 26.8.1, using
`pnpm verify:consumer-bundle`: esbuild bundle/minify/tree shaking, ESM output and gzip level 9.
KB below means 1,024 bytes. Exact fixture bodies and growth budgets are in
`scripts/verify/consumerBundle.mjs` and `scripts/verify/baseline/consumer-bundle.json`.

| What the application imports             | Bundle (gzip)            |
| ---------------------------------------- | ------------------------ |
| `syncEngine` alone                       | 16.1 KB (16,486 bytes)   |
| `syncEngine` + named `queryGovernor`     | 198.7 KB (203,466 bytes) |
| `syncEngine` + `governors.queryGovernor` | 523.0 KB (535,550 bytes) |
| `tournamentEngine`                       | 523.0 KB (535,528 bytes) |

The older 7.14 table's bare-engine figure was about 27 KB. In 7.15, #5471 recorded
27.1 → 15.7 KB; the current measurement above includes subsequent changes. It is an import-scenario
measurement, not the size of an entire application. See [7.x performance](../concepts/performance.md).

The third row is the trap. `governors` is an aggregate object holding every governor; once the
application touches it — even to read a single property — the bundler must retain all of them, so
`governors.queryGovernor` costs the same as the full `tournamentEngine`. Import each governor by
name from the package root:

```js
import { syncEngine, queryGovernor } from 'tods-competition-factory'; // retains queryGovernor only
```

**Recommendation:** Start with named governor imports and add methods as needed.

---

## Migration from v1.x

If migrating from Competition Factory v1.x:

```js
// v1.x - Pre-built engine
import { tournamentEngine } from 'tods-competition-factory';

// v2.x - Custom engine (same functionality)
import { governors, syncEngine } from 'tods-competition-factory';
syncEngine.importMethods(governors, true, 1);
export const tournamentEngine = syncEngine;
```

Or continue using the pre-built exports:

```js
// Still works in v2.x for backward compatibility
import { tournamentEngine } from 'tods-competition-factory';
```

---
