---
title: Custom Engines
---

Factory engines are lightweight, method-free containers until you import the specific functionality you need. This architecture enables **tree-shaking** and **code splitting**, allowing you to create custom engines with only the methods required for your use case.

**Benefits:**

- Reduced bundle size for client-side applications
- Faster load times by including only needed functionality
- Clear separation between query and mutation operations
- Modular architecture for microservices
- Type-safe method imports with full IntelliSense support

:::info
The `tournamentEngine` and `competitionEngine` exports are pre-configured custom engines provided for backwards compatibility with Competition Factory v1.x. They include all governors and methods.
:::

:::warning Engine Singleton Behavior
`syncEngine` is a singleton - importing it in multiple files returns the same instance. Methods imported into syncEngine are available everywhere it's imported. For truly independent engines in the same application, use different engine types:

- `syncEngine` for one configuration
- `askEngine` for read-only operations
- `matchUpEngine` for matchUp-specific operations

Do not import methods into `syncEngine` in multiple places, as they will accumulate. Configure your custom engine once at application startup.
:::

---

## Creating Custom Engines

### Minimal Query Engine

Create a read-only engine with just query methods. Since `syncEngine` is a singleton, configure it once and export:

```js
// queryEngine.ts
import { governors, syncEngine } from 'tods-competition-factory';

// Import only query methods
syncEngine.importMethods(governors.queryGovernor);

export { syncEngine as queryEngine };
```

**Usage:**

```js
import { queryEngine } from './queryEngine';

queryEngine.setState(tournamentRecord);

// Query methods available
const { participants } = queryEngine.getParticipants();
const { matchUps } = queryEngine.allTournamentMatchUps();

// Mutation methods NOT available
queryEngine.addEvent({ event }); // ❌ TypeError: addEvent is not a function
```

**Bundle Size:** ~60% smaller than full tournamentEngine

:::caution
Do not import `syncEngine` in other files and add more methods - they will be added to the same singleton. Configure once at app startup.
:::

---

### Minimal Mutation Engine

Create a write-only engine for specific operations. Use `askEngine` for an independent instance:

```js
// scoringEngine.ts
import { governors, askEngine } from 'tods-competition-factory';

// Import only scoring-related mutation methods
askEngine.importMethods({
  setMatchUpStatus: governors.matchUpGovernor.setMatchUpStatus,
  setMatchUpState: governors.matchUpGovernor.setMatchUpState,
});

export { askEngine as scoringEngine };
```

**Usage:**

```js
import { scoringEngine } from './scoringEngine';

scoringEngine.setState(tournamentRecord);

// Only scoring methods available
scoringEngine.setMatchUpStatus({
  matchUpId: 'match-1',
  outcome: { score: { sets: [{ side1Score: 6, side2Score: 4 }] } },
}); // ✅ Works

scoringEngine.generateDrawDefinition({ drawSize: 32 }); // ❌ Not available
```

---

### Importing Nested Methods

The `importMethods` function can traverse nested objects to import all methods:

```js
import { governors, syncEngine } from 'tods-competition-factory';

// Import all methods from all governors (full engine)
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

Minimize bundle for browser-based live scoring:

```js
// src/engines/clientEngine.ts
import { governors, syncEngine } from 'tods-competition-factory';

// Only import what's needed for live scoring UI
syncEngine.importMethods({
  // State management
  setState: governors.queryGovernor.setState,
  getState: governors.queryGovernor.getState,

  // Queries for display
  allTournamentMatchUps: governors.queryGovernor.allTournamentMatchUps,
  getMatchUp: governors.queryGovernor.getMatchUp,

  // Score entry
  setMatchUpStatus: governors.matchUpGovernor.setMatchUpStatus,

  // Score validation
  validateSetScore: governors.scoreGovernor.validateSetScore,
  validateMatchUpScore: governors.scoreGovernor.validateMatchUpScore,
});

export { syncEngine as clientEngine };
```

**Result:** 75% smaller bundle than full tournamentEngine

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
  const { venues } = this.getVenues();
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
import { governors, syncEngine } from 'tods-competition-factory';

syncEngine.importMethods({
  // State
  setState: governors.queryGovernor.setState,

  // Queries
  allTournamentMatchUps: governors.queryGovernor.allTournamentMatchUps,
  getVenuesAndCourts: governors.queryGovernor.getVenuesAndCourts,

  // Scheduling mutations
  bulkScheduleTournamentMatchUps: governors.scheduleGovernor.bulkScheduleTournamentMatchUps,
  scheduleMatchUps: governors.scheduleGovernor.scheduleMatchUps,
  clearScheduledMatchUps: governors.scheduleGovernor.clearScheduledMatchUps,
});

export { syncEngine as schedulingEngine };
```

```js
// draw-generation-service/engine.ts - Only draw generation
// Use syncEngine singleton configured once at startup
import { governors, syncEngine } from 'tods-competition-factory';

syncEngine.importMethods({
  setState: governors.queryGovernor.setState,
  addEvent: governors.eventGovernor.addEvent,
  generateDrawDefinition: governors.generationGovernor.generateDrawDefinition,
  automatedPositioning: governors.drawsGovernor.automatedPositioning,
});

export { syncEngine as drawEngine };
```

---

## Method Import Patterns

### Selective Import (Recommended)

Explicitly list needed methods for maximum control:

```js
syncEngine.importMethods({
  setState: governors.queryGovernor.setState,
  getParticipants: governors.queryGovernor.getParticipants,
  addEvent: governors.eventGovernor.addEvent,
});
```

**Pros:**

- Smallest bundle size
- Clear dependencies
- Easy to audit what's included

**Cons:**

- More verbose
- Must update when adding features

### Governor Import

Import entire governor for related functionality:

```js
// Import all query methods
syncEngine.importMethods(governors.queryGovernor);

// Import all event methods
syncEngine.importMethods(governors.eventGovernor);
```

**Pros:**

- Balanced bundle size
- Related methods grouped
- Less maintenance

**Cons:**

- May include unused methods from governor

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

Custom engines maintain full type safety:

```ts
import { governors, syncEngine } from 'tods-competition-factory';
import type { FactoryEngine } from 'tods-competition-factory';

// Type-safe custom engine
syncEngine.importMethods(governors.queryGovernor);

export { syncEngine as queryEngine };

// IntelliSense works for imported methods
queryEngine.getParticipants(); // ✅ Autocomplete available
queryEngine.addEvent({}); // ❌ TypeScript error: method not imported
```

---

## Performance Comparison

Bundle sizes for different import strategies (gzipped):

| Engine Configuration       | Bundle Size | Use Case               |
| -------------------------- | ----------- | ---------------------- |
| Selective (5 methods)      | ~15 KB      | Minimal client app     |
| Query Governor             | ~45 KB      | Read-only display      |
| Mutation Governor          | ~60 KB      | Specific mutations     |
| Full Engine                | ~180 KB     | Complete functionality |
| Pre-built tournamentEngine | ~180 KB     | Backward compatibility |

**Recommendation:** Start with selective imports and add methods as needed.

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
