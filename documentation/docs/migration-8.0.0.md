---
title: Migration to 8.0.0 (preparation)
---

# Migration to 8.0.0

This guide describes preparation for the next major release. **The engine routes described below remain available in 7.x.**

## Governor and engine route removals

See the [engine API transition manifest and per-method guidance](/docs/implementation/engine-api-transition-8). Selected methods are removal candidates pending symbol-aware consumer review and external-integrator confirmation. Their full references have moved outside the governor API listings, with migration stubs at old anchors.

Engine-route removal, standalone package-export retention and internal implementation status are separate decisions. Test-only conformance-harness access does not require a production governor export. No unsupported deep import is recommended.

### Stateless functions move to tools

Governor functions that read no tournament state and take positional arguments leave the governors and the engines in
8.0.0. An engine calls every method with one params object, so it could never call them correctly. Import them from
their domain in `tools`, available from 7.33:

```js
import { tools } from 'tods-competition-factory';

// 7.33 and later; the only route in 8.0.0
tools.scoring.validateMatchUpScore(sets, 'SET3-S:6/TB7');
tools.formats.parse('SET3-S:6/TB7');
// 7.x only
scoreGovernor.validateMatchUpScore(sets, 'SET3-S:6/TB7');
```

- `tools.formats` replaces the matchUpFormat governor's `parse`, `stringify`, `isAggregateFormat`, `finalSetGoverns` and
  `aggregateDeciderSetNumber`, and the score governor's aliases `parseMatchUpFormat` / `stringifyMatchUpFormat`.
- `tools.scoring` replaces the score governor's validators, scoring-engine state readers and point and statistics
  parsers.
- The availability helpers stay on the `availability` export and leave the engines.
- `tools.publishing` replaces the publishing governor's `isEmbargoed`, `isVisiblyPublished` and
  `getRoundVisibilityState`. Each takes the instant as `asOf`, which is optional in 7.x (it falls back to the
  competition clock) and required in 8.0.0.
- `tools.entries`, `tools.draws` and `tools.matchUps` replace the entries governor's fee helpers, the draws governor's
  `isAdHocType` / `isLadder`, and the matchUp governor's `validMatchUp` / `validMatchUps`.
- `publishingGovernor.isTournamentPublished(tournamentRecord)` is retired. It takes a whole record, so it is neither a
  query nor a tool. Use the `getPublishState` query.

The 8.0.0 release notes list every function this moves, by governor.

### `utilities` is removed

`utilities` is a deprecated alias of `tools` (`export * as utilities` beside `export * as tools`). It is removed in
8.0.0, so replace `utilities.` with `tools.`. Nothing else changes.

### Progression edges: addGoesTo

Use [the supported storage, ingest, draw-addition and read-projection routes](/docs/implementation/records/addGoesTo#supported-migration-routes). The old helper mutates stored matchUps despite its query-governor placement and is not a safe read-only API.

## Other 8.0.0 changes

This page covers the governor transition; it is not yet a complete release migration checklist. Consolidate the other approved breaking changes here before cutting 8.0.0.
