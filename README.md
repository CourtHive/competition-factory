<p align="center">
  <a href="http://courthive.com/" target="blank"><img src="./src/fixtures/images/red-ch-logo.png" width="220" alt="CourtHive Logo" /></a>
</p>
<p align="center">Configurable Tournament Operations for Competition Management.</p>
<p align="center"><a href='https://courthive.github.io/competition-factory/'>Documentation and Examples</a></p>
<p align="center">
<a href="https://www.npmjs.com/~tods-competition-factory" target="_blank"><img src="https://img.shields.io/npm/v/tods-competition-factory" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~tods-competition-factory" target="_blank"><img src="https://img.shields.io/npm/l/tods-competition-factory" alt="Package License" /></a>
<a href="https://www.npmjs.com/~tods-competition-factory" target="_blank"><img src="https://img.shields.io/npm/dm/tods-competition-factory" alt="NPM Downloads" /></a>
</p>

## Overview

The **Competition Factory** is a collection of functions for transforming and mutating tournament records. Core engines capture the types of state transitions fundamental to running tournaments — draw generation, participant assignments, matchUp scheduling, score recording, and outcome determination.

Rather than hardcoding tournament structures or embedding business rules in database stored procedures, the factory is configured through **JSON policy definitions** and **JSON-described tournament structures**. This provides:

- **Deployment Flexibility** — Operations can execute on standalone clients, servers, or both
- **Platform Independence** — An entire tournament management solution [can run in a browser](https://courthive.github.io/TMX), communicate with a server, or operate entirely offline
- **Scalable Architectures** — Server deployments support highly scalable asynchronous processing in **Node.js**
- **Configurable Behavior** — Reasonable defaults for all operations, with extensive configuration through policy definitions
- **Consistent Results** — The same configuration produces identical tournament structures regardless of where operations execute
- **Zero Dependencies** — No runtime dependencies; every utility is built on platform APIs (`Intl.DateTimeFormat`, `Date`), eliminating supply-chain risk and version conflicts

## Cross-Sport Applicability

While originally inspired by the **[Tennis Open Data Standards (TODS)](https://itftennis.atlassian.net/wiki/spaces/TODS/overview)**, the data structures and configurable operations apply to tournaments across many sports. The factory has been successfully deployed across **five racquet sports**, and this cross-sport reality is reflected in **[CODES](https://courthive.github.io/competition-factory/docs/data-standards#codes)** (Competition Open Data Exchange Standards), the factory's expanded data model.

## State Engines

The factory includes synchronous and asynchronous **state engines** that provide services for managing tournament record state, publishing subscriptions for real-time data synchronization, notifications and logging for audit trails, and middleware integration for custom business logic.

## Draw Type Innovations

Beyond pre-defined draw types, the factory's linked structure architecture enables tournament topologies of arbitrary complexity:

- **[DrawMatic](https://courthive.github.io/competition-factory/docs/concepts/draw-types/drawmatic)** — Probabilistic pairing for flexible-round events with skill-based matching and team boundary awareness
- **[Lucky Draw](https://courthive.github.io/competition-factory/docs/concepts/draw-types/lucky-draw)** — Any participant count without power-of-2 constraints, with automatic lucky loser advancement
- **[Draft Draws](https://courthive.github.io/competition-factory/docs/concepts/draft-draws)** — Participant agency over positioning through tiered preference systems with full transparency

## Scheduling

Two complementary scheduling approaches: **Garman scheduling** for automated multi-day distribution respecting recovery periods, daily limits, and court availability; and **Pro scheduling** for grid-based control with fixed time slots, follow-on support, and comprehensive conflict detection.

The **Availability Engine** extends this by modelling court availability as continuous capacity streams, enabling "what-if" scenario simulation before committing to the tournament record. (Renamed from `TemporalEngine` in 5.0.0 — the `Temporal` name was vacated for the TC39 `Temporal` global; existing call sites continue to work via the engine assemblies.)

## Publishing and Embargo

Precise control over public visibility at every level — tournament, event, draw, stage, structure, and individual rounds. **Embargo** provides time-based visibility gates with explicit timezone context, enabling workflows like finalizing the order of play in the evening and setting it to go live automatically at a specific hour.

## Ranking Points and Scale Engine

The **Scale Engine** computes ranking points in real time from tournament results using configurable ranking policies. Points are calculated from finishing positions, per-win bonuses, and quality win bonuses for defeating ranked opponents. Built-in policies cover ATP, WTA, ITF, and national federation systems, with support for custom point tables as JSON policies.

## Scoring Engine

The **Scoring Engine** provides point-by-point match scoring across multiple sports and formats — standard tennis, tiebreak-only (pickleball, squash, badminton), timed sets, aggregate scoring, and rally scoring. It supports undo/redo, server tracking, substitutions, and mixed-mode entry (point-by-point combined with manual set/game entry).

## Officiating Engine

The **Officiating Engine** manages official assignments, certifications, evaluations, and suspension tracking. It supports policy-driven eligibility checks against certification requirements and evaluation score thresholds, enabling governing bodies to define and enforce officiating standards across tournaments.

## Sanctioning Engine

The **Sanctioning Engine** provides a state machine for governing body tournament sanctioning workflows. It manages the sanctioning lifecycle from application through approval, with policy-driven validation of tournament parameters against tier-specific constraints — allowed formats, draw types, categories, prize money ranges, court requirements, and calendar conflict detection.

## Installation

```bash
pnpm add tods-competition-factory
```

```js
import { tournamentEngine } from 'tods-competition-factory';
```

## Documentation

Full documentation with interactive examples: **[courthive.github.io/competition-factory](https://courthive.github.io/competition-factory/)**

## Testing

9,800+ tests covering draws, scheduling, scoring, participants, publishing, and ranking points.

```bash
pnpm test          # run all tests (Vitest)
pnpm coverage      # coverage report (thresholds: 95/95/83/95%)
```
