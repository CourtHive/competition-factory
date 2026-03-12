---
title: Competition Factory Server
sidebar_position: 8
---

# Competition Factory Server Architecture

The Competition Factory Server is a Node.js server that provides multi-user tournament management with data persistence. It demonstrates the execution queue pattern and efficient client-server synchronization for factory-based applications.

:::info
The factory server is optional. TMX works fully offline as a browser-only application. The server enables multi-user collaboration, data persistence, publishing, subscriptions and backup.
:::

## Overview

The factory server provides:

- **Multi-User Support** - Multiple TMX instances sharing tournament data
- **Data Persistence** - Tournament records saved to storage
- **Execution Queue** - Efficient mutation synchronization
- **Conflict Resolution** - Handles concurrent modifications
- **Master/Slave Modes** - Flexible ownership models
- **Offline Capability** - Reconnection and sync after disconnect
- **Factory Instance** - Server-side factory for validation
- **Change History** - Audit trail of all modifications

## Architecture

### Local-First Design

```text
┌─────────────────────────────────────────────────────┐
│  TMX Client (Browser)                               │
│  ┌────────────────────┐   ┌────────────────────┐    │
│  │ UI Layer           │   │ Local Tournament   │    │
│  │ (React)            │──▶│ Record (State)     │    │
│  └────────────────────┘   └────────────────────┘    │
│           │                         ▲               │
│           │                         │               │
│           ▼                         │               │
│  ┌─────────────────────────────────────────────┐    │
│  │ Competition Factory (Browser Instance)      │    │
│  │                                             │    │
│  │  ┌─────────────┐  ┌────────────────────┐    │    │
│  │  │ QUERIES     │  │ MUTATIONS          │    │    │
│  │  │ (local)     │  │ (queued to server) │    │    │
│  │  └─────────────┘  └────────────────────┘    │    │
│  └─────────────────────────────────────────────┘    │
│                          │                          │
│                          │ Execution Queue          │
│                          ▼                          │
│  ┌─────────────────────────────────────────────┐    │
│  │ WebSocket / HTTP                            │    │
│  └─────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────┘
                          │
                          │ Only mutations sent
                          │
                          ▼
┌─────────────────────────────────────────────────────┐
│  Competition Factory Server                         │
│  ┌─────────────────────────────────────────────┐    │
│  │ WebSocket / HTTP Handler                    │    │
│  └─────────────────────────────────────────────┘    │
│                          │                          │
│                          ▼                          │
│  ┌─────────────────────────────────────────────┐    │
│  │ Execution Queue Processor                   │    │
│  │ - Receives method calls with parameters     │    │
│  │ - Executes on server factory instance       │    │
│  │ - Validates and applies changes             │    │
│  │ - Returns results                           │    │
│  └─────────────────────────────────────────────┘    │
│                          │                          │
│                          ▼                          │
│  ┌─────────────────────────────────────────────┐    │
│  │ Competition Factory (Server Instance)       │    │
│  │ - Maintains server-side tournament record   │    │
│  │ - Validates all operations                  │    │
│  │ - Ensures data integrity                    │    │
│  └─────────────────────────────────────────────┘    │
│                          │                          │
│                          ▼                          │
│  ┌─────────────────────────────────────────────┐    │
│  │ Data Storage                                │    │
│  │ - Tournament records (JSON)                 │    │
│  │ - Execution history                         │    │
│  │ - User sessions                             │    │
│  └─────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────┘
```

## Key Concepts

### Execution Queue Pattern

Instead of sending full tournament records, TMX sends **method calls with parameters**:

```js
// Client queues mutation
{
  method: 'addParticipant',
  params: {
    participant: {
      participantType: 'INDIVIDUAL',
      person: {
        standardGivenName: 'John',
        standardFamilyName: 'Doe'
      }
    }
  },
  timestamp: '2024-06-15T10:30:00Z',
  clientId: 'client-uuid'
}
```

```js
// Server receives queue entry
// Executes same method on server factory
const result = tournamentEngine.addParticipant(params);

// Returns result to client
{
  success: true,
  participant: { participantId: 'uuid', ... },
  timestamp: '2024-06-15T10:30:00.123Z'
}
```

**Benefits:**

- **Efficiency** - Only changes transmitted, not entire records
- **Consistency** - Same factory methods on client and server
- **Validation** - Server validates all operations
- **History** - Complete audit trail of changes
- **Conflict Resolution** - Server can detect and resolve conflicts

### Query vs Mutation Separation

**Queries (Local Only)**

```js
// Fast, no network needed
const { participants } = tournamentEngine.getParticipants();
const { events } = tournamentEngine.getEvents();
const { matchUps } = tournamentEngine.getAllEventMatchUps({ eventId });

// Instant response from local state
```

**Mutations (Queued to Server)**

```js
// Queued for server execution
tournamentEngine.addParticipant({ participant });
tournamentEngine.addEvent({ event });
tournamentEngine.setMatchUpStatus({ matchUpId, outcome });

// Applied locally (optimistic)
// Sent to server for validation
// Server confirms or rejects
```

### Master/Slave Modes

#### Master Mode (Default)

```text
Client is authoritative
├─ Makes changes locally first (optimistic)
├─ Sends execution queue to server
├─ Server applies and stores changes
└─ Server broadcasts to other clients
```

#### Slave Mode

```text
Server is authoritative
├─ Client requests changes
├─ Server validates and applies
├─ Server sends updated state to client
└─ Client updates local state from server
```

### Offline/Online Transitions

```js
// Client goes offline
- Continues operating with local factory
- Queues all mutations
- UI indicates offline status

// Client comes back online
- Reconnects to server
- Sends queued mutations
- Receives any missed updates
- Resolves conflicts if any
- Syncs to current state
```

## Implementation Details

### Client-Side Queue

```js
class ExecutionQueue {
  constructor() {
    this.queue = [];
    this.pending = [];
  }

  // Add mutation to queue
  enqueue(method, params) {
    const entry = {
      id: generateId(),
      method,
      params,
      timestamp: new Date().toISOString(),
      clientId: this.clientId,
    };

    this.queue.push(entry);
    this.send(entry);
    return entry.id;
  }

  // Send to server
  async send(entry) {
    if (!navigator.onLine) {
      // Store for later
      return;
    }

    this.pending.push(entry);

    try {
      const response = await fetch('/api/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry),
      });

      const result = await response.json();
      this.handleResult(entry.id, result);
    } catch (error) {
      this.handleError(entry.id, error);
    }
  }

  // Handle server response
  handleResult(entryId, result) {
    const entry = this.pending.find((e) => e.id === entryId);

    if (result.success) {
      // Remove from pending
      this.pending = this.pending.filter((e) => e.id !== entryId);
    } else {
      // Handle conflict or error
      this.handleConflict(entry, result);
    }
  }

  // Sync on reconnect
  async sync() {
    for (const entry of this.queue) {
      await this.send(entry);
    }
  }
}
```

### Server-Side Processing

```js
// Server receives execution queue entry
app.post('/api/execute', async (req, res) => {
  const { method, params, timestamp, clientId } = req.body;

  try {
    // Load tournament state
    const tournamentRecord = await loadTournament(params.tournamentId);

    // Set state in factory
    tournamentEngine.setState(tournamentRecord);

    // Execute method
    const result = tournamentEngine[method](params);

    if (result.success !== false) {
      // Save updated state
      const updated = tournamentEngine.getState();
      await saveTournament(updated);

      // Log execution
      await logExecution({
        method,
        params,
        result,
        timestamp,
        clientId,
      });

      // Broadcast to other clients
      broadcastUpdate({
        method,
        params,
        result,
        excludeClient: clientId,
      });

      res.json({ success: true, result });
    } else {
      res.json({ success: false, error: result.error });
    }
  } catch (error) {
    console.error('Execution error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});
```

### Conflict Resolution

```js
// Detect conflicts
function detectConflict(entry, serverState) {
  // Check if entry's preconditions still valid
  const { method, params } = entry;

  if (method === 'setMatchUpStatus') {
    // Check if matchUp still exists
    const { matchUp } = tournamentEngine.getMatchUp({
      matchUpId: params.matchUpId,
    });

    if (!matchUp) {
      return { conflict: true, reason: 'MatchUp not found' };
    }

    // Check if matchUp already has different score
    if (matchUp.winningSide && matchUp.winningSide !== params.outcome.winningSide) {
      return { conflict: true, reason: 'Different score already entered' };
    }
  }

  return { conflict: false };
}

// Resolve conflicts
function resolveConflict(entry, conflict) {
  // Strategy depends on method and conflict type

  // Last write wins
  if (conflict.strategy === 'LAST_WRITE_WINS') {
    return { action: 'APPLY', entry };
  }

  // Server wins
  if (conflict.strategy === 'SERVER_WINS') {
    return { action: 'REJECT', entry };
  }

  // Merge changes
  if (conflict.strategy === 'MERGE') {
    const merged = mergeChanges(entry, conflict.serverState);
    return { action: 'APPLY', entry: merged };
  }

  // Ask user
  return { action: 'ASK_USER', entry, conflict };
}
```

## Server Configuration

### Basic Server Setup

```js
const express = require('express');
const { tournamentEngine } = require('tods-competition-factory');

const app = express();
app.use(express.json());

// Store tournaments in memory (or database)
const tournaments = new Map();

// Load tournament
app.get('/api/tournaments/:id', (req, res) => {
  const tournament = tournaments.get(req.params.id);
  if (tournament) {
    res.json(tournament);
  } else {
    res.status(404).json({ error: 'Tournament not found' });
  }
});

// Execute method
app.post('/api/execute', async (req, res) => {
  const { tournamentId, method, params } = req.body;

  // Load and set state
  const tournament = tournaments.get(tournamentId);
  tournamentEngine.setState(tournament);

  // Execute
  const result = tournamentEngine[method](params);

  // Save updated state
  if (result.success !== false) {
    const updated = tournamentEngine.getState();
    tournaments.set(tournamentId, updated);
  }

  res.json(result);
});

app.listen(3000, () => {
  console.log('Factory server running on port 3000');
});
```

### WebSocket Support

```js
const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 3001 });

const clients = new Map();

wss.on('connection', (ws) => {
  const clientId = generateId();
  clients.set(clientId, ws);

  ws.on('message', async (message) => {
    const { type, payload } = JSON.parse(message);

    if (type === 'EXECUTE') {
      const result = await executeMethod(payload);

      // Send result to requesting client
      ws.send(JSON.stringify({ type: 'RESULT', payload: result }));

      // Broadcast to other clients
      broadcastUpdate(clientId, payload, result);
    }
  });

  ws.on('close', () => {
    clients.delete(clientId);
  });
});

function broadcastUpdate(excludeClient, method, result) {
  const message = JSON.stringify({
    type: 'UPDATE',
    payload: { method, result },
  });

  clients.forEach((client, clientId) => {
    if (clientId !== excludeClient && client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}
```

## Data Persistence

### File System Storage

```js
const fs = require('fs').promises;
const path = require('path');

async function saveTournament(tournamentId, tournamentRecord) {
  const filepath = path.join('data', `${tournamentId}.json`);
  await fs.writeFile(filepath, JSON.stringify(tournamentRecord, null, 2));
}

async function loadTournament(tournamentId) {
  const filepath = path.join('data', `${tournamentId}.json`);
  const data = await fs.readFile(filepath, 'utf8');
  return JSON.parse(data);
}
```

### Database Storage

```js
// MongoDB example
async function saveTournament(tournamentId, tournamentRecord) {
  await db
    .collection('tournaments')
    .updateOne({ tournamentId }, { $set: { record: tournamentRecord, updated: new Date() } }, { upsert: true });
}

async function loadTournament(tournamentId) {
  const doc = await db.collection('tournaments').findOne({ tournamentId });
  return doc?.record;
}
```

### Execution History

```js
// Log all executions for audit trail
async function logExecution(entry) {
  await db.collection('execution_log').insertOne({
    ...entry,
    serverTimestamp: new Date(),
  });
}

// Query execution history
async function getExecutionHistory(tournamentId, options = {}) {
  return db
    .collection('execution_log')
    .find({ 'params.tournamentId': tournamentId })
    .sort({ serverTimestamp: -1 })
    .limit(options.limit || 100)
    .toArray();
}
```

## Best Practices

### Performance

- Keep server-side factory instance in memory
- Cache tournament records
- Use WebSockets for real-time updates
- Batch queue entries when possible

### Reliability

- Validate all method parameters
- Check factory method results
- Handle errors gracefully
- Log all operations
- Implement retry logic

### Security

- Authenticate clients
- Validate permissions
- Sanitize inputs
- Rate limit requests
- Encrypt connections (HTTPS/WSS)

### Scalability

- Use database for persistent storage
- Implement caching layer
- Consider message queue for high volume
- Load balance multiple server instances
- Separate read/write paths

## Deployment

### Production Considerations

```js
// Configuration
const config = {
  port: process.env.PORT || 3000,
  database: process.env.DATABASE_URL,
  redis: process.env.REDIS_URL,
  cors: {
    origin: process.env.ALLOWED_ORIGINS.split(','),
    credentials: true,
  },
  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
  },
};

// Error handling
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  // Log to monitoring service
  gracefulShutdown();
});

// Graceful shutdown
function gracefulShutdown() {
  console.log('Shutting down gracefully...');

  server.close(() => {
    console.log('HTTP server closed');

    // Close database connections
    db.close();

    process.exit(0);
  });

  // Force shutdown after 30 seconds
  setTimeout(() => {
    console.error('Forced shutdown');
    process.exit(1);
  }, 30000);
}
```

## Related Documentation

- [Engine Methods](../engines/engine-methods.md) - All factory methods
- [State Management](../engines/state-engines.mdx) - Managing state
- [Browser Console](./browser-console.md) - Client-side factory usage
- [TMX Overview](./overview.md) - Complete TMX architecture

## Example Implementation

The tmxServer in the CourtHive repository provides a complete reference implementation:

```bash
cd tmxServer
npm install
npm start
```

Review the source code to see:

- Complete execution queue implementation
- WebSocket and HTTP endpoints
- Conflict resolution strategies
- Data persistence patterns
- Error handling
- Client synchronization

The factory server pattern enables powerful multi-user tournament management while maintaining the benefits of local-first architecture and the simplicity of the Competition Factory API.
