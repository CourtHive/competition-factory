---
title: State Inspection (engine.inspect)
---

`engine.inspect()` returns a single, typed snapshot of "what's loaded right now": factory version, write-mode flags, tournament IDs in state, lightweight counts of the major collections, active subscription topics, and the current `devContext`. It's intended for `console.log(engine.inspect())` during debugging, paste-into-bug-report scenarios, and devtools panels.

```ts
const snap = tournamentEngine.inspect();
console.log(snap);
// {
//   version: '5.0.0-alpha.0',
//   schemaWriteMode: 'NATIVE',
//   saveDrawDeletions: false,
//   auditAuthorityServer: false,
//   loaded: {
//     tournamentIds: ['tournament-1', 'tournament-2'],
//     currentTournamentId: 'tournament-1',
//     counts: {
//       tournaments: 2, events: 4, drawDefinitions: 6, structures: 8,
//       matchUps: 124, participants: 96, venues: 1, courts: 6,
//     },
//   },
//   subscriptions: { topics: ['addMatchUps', 'modifyMatchUp'] },
//   devContext: false,
// }
```

## Shape

```ts
interface EngineInspection {
  version: string;
  schemaWriteMode: string;
  saveDrawDeletions: boolean;
  auditAuthorityServer: boolean;
  loaded: {
    tournamentIds: string[];
    currentTournamentId?: string;
    counts: EngineInspectionCounts;
  };
  subscriptions: { topics: string[] };
  devContext: any;
}

interface EngineInspectionCounts {
  tournaments: number;
  events: number;
  drawDefinitions: number;
  structures: number;
  matchUps: number;
  participants: number;
  venues: number;
  courts: number;
}
```

Both interfaces are exported from the package.

## What it's good for

- **Bug reports.** Paste the output into an issue and the maintainer immediately knows the engine state shape without asking "what did you have loaded?"
- **Devtools tooltips.** TMX can render the snapshot in a "what is loaded right now?" panel for support staff.
- **Quick triage.** When `engine.getEvents()` returns `undefined`, `engine.inspect().loaded.tournamentIds` tells you whether anything is loaded at all.
- **Regression smoke tests.** Assert that after `setState`, the counts match expectation.

## What it's NOT

- **Not a state dump.** Counts only — no record bodies, no participants payload, no matchUp details. Use `engine.getState()` for the full picture (which is much heavier).
- **Not a perf monitor.** No timing metrics, no memory stats. See `timeKeeper` in `globalState` for that.
- **Not stable for snapshot tests.** Counts move every time the underlying records change. Use it as a debug aid, not a fixture.

## Performance

`engine.inspect()` is intentionally cheap: it walks the loaded `tournamentRecords` once to compute counts (O(events × draws × structures × matchUps)). For a typical tournament (1 record, ~5 events, ~150 matchUps) it returns in well under a millisecond. For an unusually large state (50+ events) it might cost a few ms. Safe to call from hot paths, including render functions.

It's also side-effect-free — no notices fired, no global state mutated, no caches touched.

## Typed access

`inspect` is exposed on `FactoryEngineTyped` and via the standard engine surface. Consumers opting into the typed engine get full IDE support on the return type:

```ts
import { tournamentEngine } from 'tods-competition-factory';
import type { EngineInspection } from 'tods-competition-factory';

function snapshotForBugReport(): EngineInspection {
  return tournamentEngine.inspect();
}
```

See `src/forge/inspect.ts` for the implementation.
