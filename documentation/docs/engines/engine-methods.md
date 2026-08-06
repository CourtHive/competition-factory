---
title: Engine Methods
---

## importMethods

Imports custom methods into the engine, making them available through the engine's invoke pattern with middleware, subscriptions, and logging support.

**Purpose:** Extend engine functionality with custom methods while leveraging the engine's built-in features like parameter middleware, result processing, subscriptions, logging, and error handling.

**When to Use:**

- Adding custom business logic to the engine
- Extending engine capabilities for specific use cases
- Integrating third-party functionality
- Creating reusable method collections
- Building domain-specific engines (see [Custom Engines](/docs/engines/custom-engines))

**Parameters:**

```ts
methods: {
  [key: string]: Function | {  // Method name as key
    method: Function;           // The actual method
    [key: string]: any;         // Additional metadata
  };
};
traverse?: boolean | string[];  // Traverse nested objects (true/false or array of keys)
maxDepth?: number;              // Maximum traversal depth (default: 3)
global?: boolean;               // Make methods globally available across all engines
```

**Returns:**

```ts
{
  success: true;
  methods?: string[];  // List of all available methods including imported ones
}
```

**Examples:**

```js
// Import simple methods
engine.importMethods({
  customValidation: (params) => {
    // Custom validation logic
    return { success: true, isValid: true };
  },
  customCalculation: (params) => {
    return { result: params.a + params.b };
  }
});

// Use imported methods like any engine method
const result = engine.customValidation({ data: {...} });

// Import nested method collections
engine.importMethods({
  reporting: {
    generateReport: (params) => { /* ... */ },
    exportData: (params) => { /* ... */ }
  }
}, true);  // traverse: true to import nested methods

// Import with metadata
engine.importMethods({
  specialMethod: {
    method: (params) => { /* ... */ },
    description: 'Special custom logic',
    version: '1.0.0'
  }
});

// Import globally (available to all engine instances)
engine.importMethods({
  sharedUtility: (params) => { /* ... */ }
}, false, 3, true);  // global: true
```

**Notes:**

- Imported methods have access to engine middleware and subscriptions
- Methods can return standard `{ success, error, ...data }` result objects
- Traverse option allows importing nested method collections
- Global methods are shared across all engine instances (sync and async)
- Imported methods appear in engine method lists
- See [Custom Engines](/docs/engines/custom-engines) for building specialized engines
- Methods can use engine's devContext for conditional logging

**Advanced Usage:**

```js
// Create a custom engine with domain-specific methods
const customEngine = syncEngine();

customEngine.importMethods({
  tennis: {
    calculateUTR: (params) => { /* ... */ },
    validateScore: (params) => { /* ... */ },
    computeRankingPoints: (params) => { /* ... */ }
  }
}, true);

// Enable logging for custom methods
customEngine.devContext({
  params: ['calculateUTR'],
  result: ['calculateUTR']
});

// Use custom methods
const utr = customEngine.calculateUTR({ matchHistory: [...] });
```

---

## getTournament

Returns a deep copy of a specific tournament record from engine state.

**Purpose:** Retrieve a tournament record without modifying the internal engine state. The returned copy is safe to modify without affecting the engine's internal state.

**When to Use:**

- When you need to inspect tournament data
- When you want to export a tournament for storage
- When you need a snapshot of tournament state at a specific point

**Parameters:**

```ts
{
  tournamentId?: string;       // Optional - specific tournament ID (defaults to current active tournament)
  convertExtensions?: boolean; // Optional - convert extension objects to JSON strings
  removeExtensions?: boolean;  // Optional - strip all extensions from the copy
}
```

**Returns:**

```ts
{
  tournamentRecord?: object;   // Tournament record object (undefined if tournamentId not found)
}
```

**Example:**

```js
// Get the currently active tournament
const { tournamentRecord } = engine.getTournament();

// Get a specific tournament by ID
const { tournamentRecord } = engine.getTournament({
  tournamentId: 'tournament-123',
});

// Get tournament without extensions (useful for storage/transmission)
const { tournamentRecord } = engine.getTournament({
  removeExtensions: true,
});
```

**Notes:**

- Returns `{}` if no tournamentId is provided and no tournament is active
- The returned object is a deep copy, so modifications won't affect engine state
- Use `removeExtensions: true` when serializing for storage to reduce size

---

## getState

Returns all tournament records currently loaded in engine state along with the active tournament ID.

**Purpose:** Get a complete snapshot of the engine's current state, including all loaded tournaments and which one is currently active.

**When to Use:**

- When managing multiple tournaments simultaneously
- When you need to save/restore the complete engine state
- When debugging to see all loaded tournaments
- Before clearing state to create a backup

**Parameters:**

```ts
{
  convertExtensions?: boolean; // Optional - convert extension objects to JSON strings
  removeExtensions?: boolean;  // Optional - strip all extensions from copies
}
```

**Returns:**

```ts
{
  tournamentId?: string;              // Currently active tournament ID (undefined if none set)
  tournamentRecords: {                // Object containing all loaded tournaments
    [tournamentId: string]: object;  // Keyed by tournament ID
  };
}
```

**Example:**

```js
// Load multiple tournaments
engine.setState([tournament1, tournament2, tournament3]);

// Get complete state
const { tournamentId, tournamentRecords } = engine.getState();

console.log(tournamentId); // Active tournament ID
console.log(Object.keys(tournamentRecords)); // ['id1', 'id2', 'id3']

// Get state without extensions for serialization
const state = engine.getState({ removeExtensions: true });
localStorage.setItem('engineState', JSON.stringify(state));
```

**Notes:**

- Returns deep copies of all tournament records
- Useful for implementing undo/redo functionality
- See [Global State](/docs/engines/global-state) for more on multi-tournament management

---

## reset

Clears all tournament records from engine state and resets the active tournament ID.

**Purpose:** Completely clear the engine state, removing all loaded tournaments. This is a destructive operation that cannot be undone.

**When to Use:**

- Starting fresh with new tournament data
- Cleaning up after tests
- Freeing memory after tournament processing is complete
- Before loading a completely different set of tournaments

**Parameters:** None

**Returns:**

```ts
{
  success: true;
  methods?: string[];  // Available engine methods
}
```

**Example:**

```js
// Load a tournament
engine.setState(tournamentRecord);

// Process tournament...

// Clear all data when done
engine.reset();

// Engine state is now empty
const { tournamentRecords } = engine.getState();
console.log(tournamentRecords); // {}
```

**Notes:**

- This operation cannot be undone
- All tournament records are removed from memory
- Consider using `getState()` to backup data before calling `reset()`
- After `reset()`, you must load tournaments again before using governor methods

---

## devContext

Sets the development context for controlling engine logging and debugging behavior.

**Purpose:** Enable detailed logging of engine operations for debugging and development. Control what gets logged (parameters, results, errors) on a global or per-method basis.

**When to Use:**

- Debugging engine behavior during development
- Tracking parameter values passed to methods
- Monitoring results from specific operations
- Identifying performance bottlenecks
- Understanding method execution flow

**Parameters:**

```ts
contextCriteria: boolean | {
  errors?: boolean | string[];   // Log errors for all methods or specific methods
  params?: boolean | string[];   // Log parameters for all methods or specific methods
  result?: boolean | string[];   // Log results for all methods or specific methods
  exclude?: string[];            // Exclude specific methods from logging
  [key: string]: any;            // Custom context properties
}
```

**Returns:**

```ts
{
  success: true;
  methods?: string[];  // Available engine methods
}
```

**Examples:**

```js
// Enable all logging
engine.devContext(true);

// Log only errors
engine.devContext({ errors: true });

// Log params and results for specific methods
engine.devContext({
  params: ['addMatchUpScheduledTime', 'bulkScheduleTournamentMatchUps'],
  result: ['addMatchUpScheduledTime'],
  errors: true, // Log all errors
});

// Custom context for conditional logging
engine.devContext({
  WOWO: true, // Custom flag
  verbose: true,
});

// Disable all logging
engine.devContext(false);
```

**Notes:**

- Logging goes to console by default
- Can significantly impact performance when enabled
- Use `exclude` array to prevent logging for high-frequency methods
- Custom properties can be checked with `getDevContext(criteria)`
- See [Engine Logging](/docs/engines/engine-logging) for more details

---

## getDevContext

Returns the current development context, optionally checking if it matches specified criteria.

**Purpose:** Inspect the current dev context settings or conditionally check if specific context properties are set. Useful for conditional logging or debugging logic.

**When to Use:**

- Checking if dev mode is enabled before expensive logging operations
- Conditional behavior based on context flags
- Debugging to see what logging is currently enabled
- Verifying context matches expected state

**Parameters:**

```ts
contextCriteria?: {  // Optional - if provided, checks if all criteria match
  [key: string]: any;
}
```

**Returns:**

```ts
// If no criteria provided:
boolean | object; // Current devContext value

// If criteria provided:
boolean | object; // Returns devContext if all criteria match, otherwise false
```

**Examples:**

```js
// Set some context
engine.devContext({ WOWO: true, debug: true });

// Get current context
const context = engine.getDevContext();
console.log(context); // { WOWO: true, debug: true }

// Check if specific criteria match
const matches = engine.getDevContext({ WOWO: true });
console.log(matches); // { WOWO: true, debug: true } - returns full context if match

const noMatch = engine.getDevContext({ FOO: true });
console.log(noMatch); // false - criteria don't match

// Use in conditional logic
if (engine.getDevContext({ verbose: true })) {
  // Only execute expensive logging when verbose mode is on
  console.log('Detailed state:', JSON.stringify(state, null, 2));
}
```

**Notes:**

- Returns `false` if context is not set or doesn't match criteria
- Returns the full devContext object if criteria match
- When no criteria provided, returns current devContext value (boolean or object)
- Useful for implementing conditional debugging behavior

---

## newTournamentRecord

Creates a new, empty tournament record, loads it into engine state, and sets it as the active tournament.

**Purpose:** Quickly create and load a new tournament with basic attributes. The tournament is automatically loaded and set as active, ready for adding events, participants, and other data.

**When to Use:**

- Starting a new tournament from scratch
- Creating a tournament programmatically
- Initializing a tournament before manual data entry
- Testing with fresh tournament instances

**Parameters:**

```ts
{
  tournamentName?: string;      // Tournament name (default: generated name)
  startDate?: string;           // ISO date string (default: today)
  endDate?: string;             // ISO date string (default: today + 7 days)
  tournamentId?: string;        // Custom ID (default: auto-generated UUID)
  [key: string]: any;           // Additional tournament attributes
}
```

**Returns:**

```ts
{
  success: true;
  tournamentId: string; // The new tournament's ID
}
```

**Example:**

```js
// Create tournament with defaults
const result = engine.newTournamentRecord();
console.log(result.tournamentId); // Auto-generated UUID

// Create tournament with specific details
const result = engine.newTournamentRecord({
  tournamentName: 'Summer Open 2024',
  startDate: '2024-07-01',
  endDate: '2024-07-07',
  tournamentRank: 'INTERNATIONAL',
  indoorOutdoor: 'OUTDOOR',
});

// Tournament is now loaded and active
const { tournamentRecord } = engine.getTournament();
console.log(tournamentRecord.tournamentName); // 'Summer Open 2024'

// Add events and other data
engine.addEvent({
  event: {
    eventName: 'Singles',
    eventType: 'SINGLES',
  },
});
```

**Notes:**

- The new tournament is automatically loaded into engine state
- The new tournament becomes the active tournament (no need to call `setTournamentId`)
- Equivalent to calling `createTournamentRecord()` followed by `setState()`
- Returns error if tournament creation fails
- See `createTournamentRecord` in Tournament Governor for more creation options

---

## setState

See [Global State](/docs/engines/global-state#setstate)

**API Reference:** [addEvent](/docs/governors/event-governor#addevent)

```js
engine.setState(tournamentRecords, deepCopyOption, deepCopyAttributes);
```

---

## setTournamentId

Sets the active tournament ID, making that tournament the target for all subsequent engine operations.

**Purpose:** Switch between multiple loaded tournaments. When you have multiple tournament records loaded in engine state, this method specifies which one engine methods will operate on.

**When to Use:**

- Managing multiple tournaments simultaneously
- Switching context between tournaments
- After loading multiple tournaments with `setState([tournament1, tournament2])`
- Before performing operations on a specific tournament

**Parameters:**

```ts
tournamentId?: string  // Tournament ID to make active (undefined clears active tournament)
```

**Returns:** `void`

**Examples:**

```js
// Load multiple tournaments
engine.setState([tournament1, tournament2, tournament3]);

// Switch to first tournament
engine.setTournamentId(tournament1.tournamentId);

// Add participants to tournament1
engine.addParticipants({ participants: [...] });

// Switch to second tournament
engine.setTournamentId(tournament2.tournamentId);

// Add participants to tournament2
engine.addParticipants({ participants: [...] });

// Clear active tournament (operations will fail until tournamentId is set)
engine.setTournamentId();

// Check which tournament is active
const activeId = engine.getTournamentId();
```

**Notes:**

- Does not validate that the tournamentId exists in loaded state
- Passing `undefined` clears the active tournament
- All governor methods operate on the active tournament
- When loading a single tournament with `setState(record)`, it's automatically set as active
- See [Global State](/docs/engines/global-state) for multi-tournament patterns

---

## getTournamentId

Returns the currently active tournament ID.

**Purpose:** Determine which tournament is currently active in engine state. Useful for debugging or implementing multi-tournament logic.

**When to Use:**

- Verifying which tournament is active
- Implementing multi-tournament UI logic
- Debugging state management issues
- Conditional logic based on active tournament

**Parameters:** None

**Returns:**

**API Reference:** [addParticipants](/docs/governors/participant-governor#addparticipants)

```ts
string | undefined; // Active tournament ID, or undefined if none set
```

**Examples:**

```js
// Load a tournament
engine.setState(tournamentRecord);

// Get active tournament ID
const activeId = engine.getTournamentId();
console.log(activeId); // tournamentRecord.tournamentId

// When managing multiple tournaments
engine.setState([tournament1, tournament2]);
engine.setTournamentId(tournament1.tournamentId);

const currentId = engine.getTournamentId();
if (currentId === tournament1.tournamentId) {
  // Perform tournament1-specific operations
}

// After reset
engine.reset();
console.log(engine.getTournamentId()); // undefined
```

**Notes:**

- Returns `undefined` if no tournament is active
- The active tournament is set automatically when loading a single tournament with `setState(record)`
- Use `setTournamentId()` to change the active tournament

---

## setTournamentRecord

Loads a single tournament record into engine state, replacing any existing tournament with the same ID.

**Purpose:** Load or update a tournament record in engine state. Unlike `setState()` which can load multiple tournaments, this method handles a single tournament record.

**When to Use:**

- Loading a tournament from storage
- Updating an existing tournament record
- Adding a new tournament to already-loaded tournaments
- Replacing a specific tournament while keeping others loaded

**Parameters:**

```ts
tournamentRecord: object  // Tournament record to load
deepCopyOption?: boolean  // Whether to deep copy (default: true)
deepCopyAttributes?: object  // Fine-tune copy behavior
```

**Returns:**

```ts
{
  success?: true;
  error?: string;  // If record is invalid
}
```

**Examples:**

```js
// Load a tournament
const result = engine.setTournamentRecord(tournamentRecord);
if (result.success) {
  console.log('Tournament loaded');
}

// Update an existing tournament
const { tournamentRecord } = engine.getTournament();
tournamentRecord.tournamentName = 'Updated Name';
engine.setTournamentRecord(tournamentRecord);

// Load additional tournament while keeping existing ones
engine.setTournamentRecord(tournament1); // Load first
engine.setTournamentRecord(tournament2); // Add second (tournament1 still loaded)
engine.setTournamentRecord(tournament3); // Add third (both previous still loaded)

// Replace a tournament (same ID overwrites)
const updatedTournament = { ...tournament1, tournamentName: 'New Name' };
engine.setTournamentRecord(updatedTournament); // Replaces tournament1

// Avoid deep copy for performance (use carefully)
engine.setTournamentRecord(tournamentRecord, false);
```

**Notes:**

- Requires `tournamentRecord.tournamentId` to be present
- Returns error if record is not an object or missing `tournamentId`
- By default creates a deep copy (safe but slower)
- Set `deepCopyOption: false` for performance when you control the record's lifecycle
- Does NOT automatically set the tournament as active - use `setTournamentId()` if needed
- Overwrites any existing tournament with the same ID

---

## removeTournamentRecord

Removes a specific tournament record from engine state by its ID.

**Purpose:** Delete a tournament from engine state when it's no longer needed, freeing memory and cleaning up state.

**When to Use:**

- Removing tournaments that are no longer needed
- Cleaning up after processing
- Managing memory in long-running applications
- Removing tournaments selectively while keeping others

**Parameters:**

```ts
tournamentId: string; // ID of tournament to remove
```

**Returns:**

```ts
{
  success?: true;
  error?: string;  // If tournamentId not found or invalid
}
```

**Examples:**

```js
// Load multiple tournaments
engine.setState([tournament1, tournament2, tournament3]);

// Remove one tournament
const result = engine.removeTournamentRecord(tournament2.tournamentId);
if (result.success) {
  console.log('Tournament removed');
}

// Verify it's gone
const { tournamentRecords } = engine.getState();
console.log(Object.keys(tournamentRecords).length); // 2 (was 3)

// Remove all tournaments one by one
const { tournamentRecords } = engine.getState();
Object.keys(tournamentRecords).forEach((id) => {
  engine.removeTournamentRecord(id);
});
```

**Notes:**

- If the removed tournament was active, no tournament will be active afterward
- Does not affect other loaded tournaments
- Use `reset()` to remove all tournaments at once
- Returns success even if tournament didn't exist
- See `removeUnlinkedTournamentRecords()` for removing based on links

---

## removeUnlinkedTournamentRecords

Removes all tournament records that are not referenced in the `LINKED_TOURNAMENTS` extension.

**Purpose:** Clean up tournaments that are not part of a linked tournament group. Useful for managing related tournaments (like qualification and main events) where only linked tournaments should be retained.

**When to Use:**

- Managing linked tournament groups (qualifications, main draws, consolations)
- Cleaning up after importing tournament data
- Removing orphaned tournament records
- Maintaining only tournaments that are part of a defined relationship

**Parameters:** None

**Returns:** `void`

**Background:**
[CODES](/docs/data-standards#codes) (Competition Open Data Exchange Standards) supports linking related tournaments through the `LINKED_TOURNAMENTS` extension. This method keeps only tournaments that are referenced in this extension, removing any others.

**Example:**

```js
// Load multiple tournaments
engine.setState([tournament1, tournament2, tournament3, tournament4]);

// tournament1 has LINKED_TOURNAMENTS extension listing tournament2 and tournament3
// tournament4 is not linked

// Remove unlinked tournaments
engine.removeUnlinkedTournamentRecords();

// Only tournament2 and tournament3 remain (referenced by tournament1)
// tournament1 and tournament4 are removed
const { tournamentRecords } = engine.getState();
console.log(Object.keys(tournamentRecords)); // IDs of tournament2 and tournament3 only
```

**Notes:**

- Looks for the `LINKED_TOURNAMENTS` extension across all loaded tournaments
- Only keeps tournaments whose IDs appear in `extension.value.tournamentIds`
- Removes the tournament containing the extension itself
- Useful for multi-stage tournament systems (qualifying → main draw)
- Does not remove individual tournaments - use `removeTournamentRecord()` for that
- Primarily used internally when managing linked tournament workflows

**Related:**

- See [Extensions](/docs/concepts/extensions) for more on tournament extensions
- See [Global State](/docs/engines/global-state) for state management patterns

---

## version

Returns NPM package version. Can be used in configurations that utilize Competition Factory engines on both client and server to ensure equivalency.

```js
const version = engine.version();
```

---
