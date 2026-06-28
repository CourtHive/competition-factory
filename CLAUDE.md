# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Mentat Orchestration (READ FIRST)

Before doing anything else, read `../Mentat/CLAUDE.md`, `../Mentat/TASKS.md`, `../Mentat/standards/coding-standards.md`, and every file in `../Mentat/in-flight/`. Mentat is the orchestration layer for the entire CourtHive ecosystem; its standards override per-repo conventions when they conflict. If you are about to start **building** (not just planning), you must claim a surface in `../Mentat/in-flight/` and run the air-traffic-control conflict check first. See the parent `../CLAUDE.md` "Mentat Orchestration" section for the full protocol.

## Project Overview

`tods-competition-factory` is the shared business-logic engine for the CourtHive ecosystem. It is published as an npm package with no runtime dependencies and is consumed by TMX (client PWA), competition-factory-server (NestJS backend), courthive-components, scoring-visualizations, and epixodic.

## Commands

```bash
pnpm install
pnpm build                # Rollup + esbuild → dist/
pnpm start                # Rollup watch mode
pnpm test                 # Vitest (3600+ tests)
pnpm tui                  # Vitest interactive UI
pnpm coverage             # Coverage report (thresholds: 95/95/83/95%)
pnpm lint                 # ESLint with fix
pnpm check-types          # tsc --noEmit
```

## Architecture Notes

- **Engine variants**: `syncEngine` (client), `asyncEngine` (server, uses Node.js `async_hooks` for per-request state isolation), plus `ask`, `mock`, `matchUp`, `scale`, `temporal` variants in `src/assemblies/engines/`.
- **Source organization** mirrors operation type:
  - `src/mutate/` — state mutations by entity (drawDefinitions, matchUps, participants, scoring, …)
  - `src/query/` — read-only queries by entity
  - `src/assemblies/governors/` — 18 business-rule governors
  - `src/assemblies/generators/` — draw/event/schedule/template generation
  - `src/constants/` — 42 constant modules
  - `src/fixtures/` — policies, scoring formats, rating parameters
  - `src/types/` — TypeScript type definitions
- **Path aliases** in tsconfig: `@Generators`, `@Assemblies`, `@Validators`, `@Constants`, `@Functions`, `@Fixtures`, `@Helpers`, `@Global`, `@Mutate`, `@Query`, `@Tests`, `@Tools`, `@Types`.
- **TypeScript strict mode** is ON. Coverage thresholds (95/95/83/95) are enforced. Husky pre-commit runs ESLint + Prettier + type check.
- **Cognitive complexity threshold**: 30. Zero violations is the standing rule.

## Code Style

- TypeScript strict mode ON
- Test files use `let result: any =` (SonarQube compliance)
- `mocksEngine` with `setState: true` is the default for test setup
- Coverage thresholds enforced — never lower them to make a test pass

## Package Installation

**Never run `npm install`** (it corrupts the pnpm-managed store). `pnpm install` is allowed — e.g. to sync the lockfile after editing deps. Keep dependency additions deliberate. Mentat standards apply.
