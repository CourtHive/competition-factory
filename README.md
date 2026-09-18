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

`discipline` is an **open vocabulary** — any string is accepted — with a curated known set covering tennis, beach tennis, wheelchair tennis, padel, pickleball, squash and badminton, plus first-class non-racquet entries for volleyball and beach volleyball. Cross-sport support is concrete rather than aspirational: the [matchUpFormat grammar](https://courthive.github.io/competition-factory/docs/codes/matchup-format) parses and round-trips each sport's scoring, and **14 rating systems** ship as fixtures spanning tennis, squash, table tennis, badminton and pickleball, each declaring which end of its scale is the top so a lower-is-better system is never silently inverted.

## Engines and Governors

Operations are exposed as engine methods — **700+ of them**, organized into **24 governors** that group business rules by entity (draws, entries, participants, scheduling, scoring, publishing, ranking, officiating, sanctioning, venues, tieFormats, policies, and more).

Several **engine variants** assemble those governors for different jobs: `syncEngine`/`tournamentEngine` for client-side and in-process use; `asyncEngine` for servers, which uses Node.js `async_hooks` to isolate state per request; plus focused `ask`, `matchUp`, `mock`, `scale`, `scoring`, `availability`, `officiating` and `sanctioning` engines. Every method resolves its own context from ids — pass a `drawId` or `eventId`, never a resolved object.

State engines provide services for managing tournament record state, publishing subscriptions for real-time data synchronization, notifications and logging for audit trails, and middleware integration for custom business logic.

## Draw Types and Linked Structures

The pre-defined catalog covers single and double elimination, round robin, round robin with playoff, Swiss, feed-in championships (to SF, to QF, and modified), Curtis consolation, first-match and first-round loser consolation, compass and Olympic draws, Page playoffs, playoff structures, ad hoc / flexible rounds, and adaptive draws.

Beyond the catalog, the factory's **[linked structure architecture](https://courthive.github.io/competition-factory/docs/concepts/draw-links)** enables tournament topologies of arbitrary complexity — multiple qualifying stages feeding different rounds, consolation brackets with custom feed patterns, or entirely novel formats. Positions propagate along links by winner, loser, or finishing position, and exits (walkovers and defaults) cascade through the topology idempotently.

### Draw Type Innovations

- **[DrawMatic](https://courthive.github.io/competition-factory/docs/concepts/draw-types/drawmatic)** — Probabilistic pairing for flexible-round events with skill-based matching and team boundary awareness
- **[Lucky Draw](https://courthive.github.io/competition-factory/docs/concepts/draw-types/lucky-draw)** — Any participant count without power-of-2 constraints, with automatic lucky loser advancement
- **[Draft Draws](https://courthive.github.io/competition-factory/docs/concepts/draft-draws)** — Participant agency over positioning through tiered preference systems with full transparency
- **[Ladder](https://courthive.github.io/competition-factory/docs/concepts/draw-types/ladder)** — Continuous, challenge-driven competition with no rounds, no bracket, and often no end date

### Ladder

A ladder's `positionAssignments` **are the standing** and `drawPosition` reads as rank. Participants challenge upward, results rearrange the standing, and the lifecycle is driven from the engine — seating and removal, challenge issue, acceptance and decline, result submission, confirmation and dispute, movement, standing and lapse queries — each resolving the ladder from `drawId` alone.

Ordering is by **`RANK`** (mutated by `SWAP` or `INSERTION` movement rules) or by **`RATING`** (derived from the scale, with direction read from the rating system rather than assumed). Self-reported results are gated on an attestation policy — peer confirmation, operator confirmation, or either — and a disputed result is blocked from moving the standing. Declines, expiry and no-shows are unified as a single **lapse** with a policy-driven consequence. Every rank change is mirrored to a dated scale item as a side effect of the position mutation, so standing history is an ordinary scale lookup.

`CHALLENGED` is the first matchUpStatus whose context is **enforced** — valid only in a `LADDER` draw, via a general `matchUpStatusScopes` mechanism rather than a special case in the setter.

## Team Competition and tieFormats

Team events are modelled as **tieFormats** — a declarative description of the collections (singles, doubles, or any custom grouping) that make up a dual match, their `matchUpFormat`s, and how collection results aggregate into a tie score. Collections can be added, modified, reordered, removed and grouped at tournament, event, draw, structure or individual matchUp scope, with orphaned formats cleaned up automatically.

**LineUps** assign individual participants to collection positions with validation, and team scores are computed from collection value, match value, set value, or group aggregation. Nineteen tieFormats ship as fixtures — collegiate formats, national federation team championships, and multi-team exhibition formats among them.

## Participants, Entries and Seeding

Participants may be individuals, pairs, teams or groups, with the full CODES record — person details, memberships, sign-in and payment status, timeItems, and scale items. Entry management covers event and draw entries, entry status transitions, alternates and promotion, pair entry construction and destruction, entry positions, and per-stage entries.

Seeding is policy-driven — seed counts by draw size, seed blocks, grouping and separation — and is complemented by an **avoidance** system that separates participants by any attribute path (country, club, team, rating band) during position assignment. **Position and matchUp actions** queries return the legal operations available in a given draw state, so a client can render exactly the affordances the rules allow rather than reimplementing them.

## Scheduling

Two complementary scheduling approaches: **Garman scheduling** for automated multi-day distribution respecting recovery periods, daily limits, and court availability; and **Pro scheduling** for grid-based control with fixed time slots, follow-on support, and comprehensive conflict detection.

Both are driven by **scheduling policies** — match duration estimates, recovery times, and daily limits per format and category — and by **scheduling profiles**, declarative persistent configurations mapping rounds to dates and venues across the whole tournament, which can be built incrementally and validated before execution. Venues, courts, and their availability windows are first-class records. **Practice courts** are handled separately, as time-bounded registrations against a court with configurable booking capacity and participant conflict detection.

The **Availability Engine** extends this by modelling court availability as continuous capacity streams, enabling "what-if" scenario simulation before committing to the tournament record. (Renamed from `TemporalEngine` in 5.0.0 — the `Temporal` name was vacated for the TC39 `Temporal` global; existing call sites continue to work via the engine assemblies.)

## Publishing and Embargo

Precise control over public visibility at every level — tournament, event, draw, stage, structure, and individual rounds. **Embargo** provides time-based visibility gates with explicit timezone context, enabling workflows like finalizing the order of play in the evening and setting it to go live automatically at a specific hour.

Admin queries always see the full publish state including active embargoes, while public queries respect the gates transparently. All embargo timestamps require explicit timezone context, so behavior does not depend on where the client or server happens to be running.

## Ranking Points and Scale Engine

The **Scale Engine** computes ranking points in real time from tournament results using configurable ranking policies. Points are calculated from finishing positions, per-win bonuses, and quality win bonuses for defeating ranked opponents, scoped by event type, draw size, tournament level, category and stage. Built-in policies cover ATP, WTA, ITF, and national federation systems, with support for custom point tables as JSON policies.

For ranking list pipelines, the engine supports **multi-tournament aggregation** with counting buckets, rolling period windows, and configurable tiebreak criteria, persisting computed awards as scale items on participant records.

The same machinery handles **ratings** as well as rankings — including **dynamic ratings** computed from match results, seeded from published values. The factory deliberately does not fetch third-party ratings; retrieving them belongs in an operator's ingest adapter, not in a competition engine.

## Scoring Engine

The **Scoring Engine** provides point-by-point match scoring across multiple sports and formats — standard tennis, tiebreak-only (pickleball, squash, badminton), timed sets, aggregate scoring, and rally scoring. It supports undo/redo, server tracking, substitutions, and mixed-mode entry (point-by-point combined with manual set/game entry).

Formats themselves are expressed as **matchUpFormat codes** — a compact, parseable grammar (`SET3-S:6/TB7`) that round-trips to a structured object, so a format is validated data rather than a string a client has to interpret. Score parsing, analysis and outcome determination are driven from the same codes.

## Officiating Engine

The **Officiating Engine** manages official assignments, certifications, evaluations, and suspension tracking. It supports policy-driven eligibility checks against certification requirements and evaluation score thresholds, enabling governing bodies to define and enforce officiating standards across tournaments.

## Sanctioning Engine

The **Sanctioning Engine** provides a state machine for governing body tournament sanctioning workflows. It manages the sanctioning lifecycle from application through approval, with policy-driven validation of tournament parameters against tier-specific constraints — allowed formats, draw types, categories, prize money ranges, court requirements, and calendar conflict detection.

## Reporting

Report queries derive operational and statistical views from a tournament record without a separate reporting store — structure reports, entry status reports, venue and court utilization, participant statistics, and a generic `generateReport` driven by a report context. Because the record is self-contained, the same reports run against a live tournament or an archived one.

## Policies

Behavior is configured by **JSON policy definitions** that can be attached at tournament, event, draw or structure scope. The factory ships a catalog of defaults covering seeding, avoidance, draws, progression, scheduling, scoring, round naming, round robin tallies, matchUp and position actions, ranking points, sanctioning, privacy, printing, competitive bands and ladders — including named variants for governing bodies and specific competition formats. Any policy can be replaced wholesale with your own JSON.

## Mock Data Generation

`mocksEngine` generates complete, valid tournament records from a compact profile — participants, events, draws, outcomes, venues, schedules and team competitions — with deterministic seeded randomness. It is how the factory's own suite is set up, and it makes reproducing a reported defect a matter of sharing a profile rather than a database dump.

```js
import { mocksEngine } from 'tods-competition-factory';

const { tournamentRecord } = mocksEngine.generateTournamentRecord({
  drawProfiles: [{ drawSize: 32, drawType: 'FEED_IN_CHAMPIONSHIP', outcomes: [] }],
  setState: true,
});
```

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

**13,000+ tests** covering draw generation and exit propagation, scheduling, scoring, participants and entries, team competition, publishing and embargo, ranking points and ratings, officiating and sanctioning.

Beyond conventional unit and integration tests, the suite includes relational property suites (do/undo, idempotence, monotonicity), agreement oracles, and an at-scale randomized sweep with delta-debugging for exit propagation — added because full branch coverage of a propagation guard proved compatible with hundreds of wrong answers.

```bash
pnpm test          # run all tests (Vitest)
pnpm coverage      # coverage report (thresholds: 95/95/85/95%)
```

## Contributing

The repository is public and MIT-licensed — **no write access is needed to contribute.** Fork it,
branch off `dev`, and open a pull request. See **[CONTRIBUTING.md](./CONTRIBUTING.md)** for the
branch and commit conventions, what to run locally, and what CI checks.
