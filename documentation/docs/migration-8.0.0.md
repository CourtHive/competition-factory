---
title: Migration to 8.0.0 (preparation)
---

# Migration to 8.0.0

This guide describes preparation for the next major release. **The engine routes described below remain available in 7.x.**

## Governor and engine route removals

See the [engine API transition manifest and per-method guidance](/docs/implementation/engine-api-transition-8). Selected methods are removal candidates pending symbol-aware consumer review and external-integrator confirmation. Their full references have moved outside the governor API listings, with migration stubs at old anchors.

Engine-route removal, standalone package-export retention and internal implementation status are separate decisions. Test-only Go-harness access does not require a production governor export. No unsupported deep import is recommended.

### Progression edges: addGoesTo

Use [the supported storage, ingest, draw-addition and read-projection routes](/docs/implementation/records/addGoesTo#supported-migration-routes). The old helper mutates stored matchUps despite its query-governor placement and is not a safe read-only API.

## Other 8.0.0 changes

This page covers the governor transition; it is not yet a complete release migration checklist. Consolidate the other approved breaking changes here before cutting 8.0.0.
