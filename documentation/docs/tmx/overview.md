---
title: TMX Overview
sidebar_position: 1
---

# TMX Tournament Management

TMX (Tournament Management eXperience) is a comprehensive, open-source tournament management application built with the Competition Factory. It demonstrates practical, production-ready usage of the factory's engines and provides a complete reference implementation for building tournament management solutions.

## What is TMX?

TMX is a full-featured tournament management system that runs entirely in the browser while maintaining optional server connectivity for data persistence and multi-user collaboration. It showcases the power and flexibility of the Competition Factory by implementing a complete tournament lifecycle from participant registration through final results.

**Try TMX:**

- [Live Demo](https://courthive.github.io/TMX) - Runs from GitHub Pages
- [GitHub Repository](https://github.com/CourtHive/TMX) - Full source code

## Key Features

### 🏆 Complete Tournament Management

- **Participant Management** - Check-in, and player statistics and results export
- **Event Creation** - Flexible event configuration with extensive category support
- **Draw Generation** - Multiple draw types with policy driven seeding
- **Scheduling** - Court assignments and match scheduling
- **Publishing** - Public-facing tournament information

### 💻 Browser-First Architecture

- **Runs Locally** - Full tournament management without internet connection
- **Local Factory Instance** - All factory engines run in the browser
- **Instant Performance** - UI queries happen locally, no server round-trips
- **Offline Capable** - Disconnect and reconnect with on-demand sync

### 🔄 Optional Server Sync

- **Execution Queue** - Only mutation requests sent to server, not full records
- **Server-First by Default** - The server executes and acknowledges before TMX applies a change; offline or
  provider-less tournaments run local-only (see [Competition Factory Server](./factory-server.md))
- **Safe Concurrency** - Writes to one tournament are serialized on the server; a record changed while offline is
  saved back only if nobody else changed it meanwhile

### 🧩 Built on CourtHive Components

TMX is built using [courthive-components](https://www.npmjs.com/package/courthive-components), a library of vanilla TypeScript UI components designed for use with Competition Factory. Neither TMX nor the components use a framework: the UI is plain TypeScript and direct DOM manipulation.

**[Component Storybook →](https://courthive.github.io/courthive-components/)**

Many of these components are used in the Factory documentation for interactive demos:

- Flight Profile Editor
- Mock Participants Generator
- Match Format Editor
- Category Editors

## TMX Architecture

### Local-First Design

```text
┌─────────────────────────────────────────────────────┐
│  TMX (Browser)                                      │
│  ┌──────────────────┐  ┌────────────────────────┐   │
│  │ UI Components    │  │ Local Tournament       │   │
│  │ (vanilla TS/DOM) │←→│ Record                 │   │
│  └──────────────────┘  └────────────────────────┘   │
│           ↓                       ↓                 │
│  ┌──────────────────────────────────────────────┐   │
│  │ Competition Factory (Local Instance)         │   │
│  │ - tournamentEngine                           │   │
│  │ - All governor methods                       │   │
│  │ - Query methods (instant, local)             │   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
                        ↕
              (Optional Connection)
                        ↕
┌─────────────────────────────────────────────────────┐
│  Competition Factory Server                         │
│  ┌────────────────────┐  ┌────────────────────────┐ │
│  │ Factory Instance   │  │ Tournament Records     │ │
│  │ (Server-side)      │  │ (Persistent Storage)   │ │
│  └────────────────────┘  └────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

### Execution Queue Pattern

TMX doesn't send full tournament records over the network. Instead:

1. **Queries** happen locally using the browser's factory instance
2. **Mutations** are structured as method calls with parameters and can be bulk processed
3. **Server executes** the same factory methods with the same parameters
4. **Results returned**: the acknowledgement, or a refusal that changes nothing
5. **The same methods** are then applied by the browser's factory, and pushed to other connected clients

Example execution queue entry:

```js
{
  method: 'addEvent',
  params: {
    event: { eventName: 'Men\'s Singles', category: { ageCategoryCode: 'U18' } }
  }
}
```

## Documentation Structure

This TMX documentation is organized by feature area, matching the main tabs in the TMX interface:

1. **[Participants](./participants.md)** - Managing tournament participants
2. **[Events & Categories](./events-categories.md)** - Creating and configuring events
3. **[Draws](./draws.md)** - Generating and managing draws
4. **[MatchUps](./matchups.md)** - Scoring and match management
5. **[Venues & Scheduling](./venues-scheduling.md)** - Court assignments and scheduling
6. **[Browser Console (dev object)](./browser-console.md)** - Direct factory interaction
7. **[Competition Factory Server](./factory-server.md)** - Server architecture and sync

## Practical Factory Usage

TMX serves as a comprehensive example of how to:

✅ **Structure a Factory-based Application**

- How to maintain tournament state
- How to handle method results and errors

✅ **Implement Common Workflows**

- Complete tournament setup sequences
- Draw generation with entry management
- Scheduling with venue and court assignments
- Publishing workflow for public consumption

✅ **Build Performant UIs**

- Local-first architecture
- Minimal server communication
- Instant query responses

✅ **Handle Edge Cases**

- Validation before mutations
- Error recovery
- Offline/online transitions

## Getting Started

### For End Users

Visit the [live demo](https://courthive.github.io/TMX) and explore the interface. You can:

- Create a sample tournament
- Import participants from Google Sheets
- Generate draws
- Enter scores
- Publish results

### For Developers

Explore the TMX source code to see how factory methods are used:

```bash
git clone https://github.com/CourtHive/TMX
cd TMX
pnpm install
pnpm start
```

TMX uses pnpm only (`npm` is refused); `pnpm start` runs the Vite dev server.

Then explore the source in `src/` to see factory integration patterns.

### For Documentation Users

Follow the pages in this section to understand:

- How each TMX feature uses the factory
- Which factory methods accomplish which tasks
- How to implement similar features in your application
- Best practices learned from production usage

## Next Steps

Continue to the [Participants](./participants.md) page to see how TMX manages tournament participants using the factory's participant governor.

---

**Related Documentation:**

- [Competition Factory Engines](../engines/engine-methods.md)
- [CourtHive Components](https://courthive.github.io/courthive-components/)
- [Publishing Concepts](../concepts/publishing/publishing-overview.md)
- [State Management](../engines/state-engines.mdx)
