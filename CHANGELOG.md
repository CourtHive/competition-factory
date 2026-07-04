# Changelog

## [6.0.2](https://github.com/CourtHive/competition-factory/compare/v6.0.1...v6.0.2) (2026-07-04)


### Bug Fixes

* **extensions:** emit sync-update methods for promoted timing/limits in native writeMode ([14c0a44](https://github.com/CourtHive/competition-factory/commit/14c0a44bf48bebea61dbb8a4adad9d869965ebc5))
* **query:** make schedule readers first-class-aware (CODES Phase 2) ([f3b86d8](https://github.com/CourtHive/competition-factory/commit/f3b86d8f3bf8bf3ef91b44fd66efd04c9c791571))
* **schedule:** clear first-class schedule on court removal + draw reset ([76b46f9](https://github.com/CourtHive/competition-factory/commit/76b46f904c83633209effb9501d9d37a140da949))
* **schedule:** clear first-class schedule on force-unschedule ([2e4ab75](https://github.com/CourtHive/competition-factory/commit/2e4ab75eb12d3de5ed839078d6da136b5d1609ed))
* **schedule:** embargoed rounds keep their date in native writeMode ([90d1665](https://github.com/CourtHive/competition-factory/commit/90d1665a84b4ce614439ad5ba9458e4c4676d0d8))
* **schedule:** remove team court assignment first-class-aware ([42b3b92](https://github.com/CourtHive/competition-factory/commit/42b3b927228ebd6d50c708e2d27e91d0121b2c33))
* **schema:** allow codes-promoted first-class attributes in tournament schema ([e08d0fc](https://github.com/CourtHive/competition-factory/commit/e08d0fcda1fe66959606174641e61e5de925f911))
* **scoring:** read disableAutoCalc first-class in native writeMode ([a4d60c1](https://github.com/CourtHive/competition-factory/commit/a4d60c106465ab201a1e8d87115e7e1b80e55fe6))


### Performance

* **query:** use Set membership for alternates/adHoc participant lookups ([d96bc0f](https://github.com/CourtHive/competition-factory/commit/d96bc0f4e4f49f4c5c5b4bd1879b50189bc7b30c))
* **query:** use Set membership for matchUp-filter ID lookups ([16d4ab0](https://github.com/CourtHive/competition-factory/commit/16d4ab0875b26d2ada7e0972221856708b1c3001))
* **query:** use Set membership for participant-filter ID lookups ([8516809](https://github.com/CourtHive/competition-factory/commit/85168092b81a99485a8a75f5c9596dc272356deb))


### Documentation

* add 6.0.0 release notes and migration guide ([3cadbed](https://github.com/CourtHive/competition-factory/commit/3cadbed9bfdb4815e3659e4c88279f728d2e272a))

## [6.0.1](https://github.com/CourtHive/competition-factory/compare/v6.0.0...v6.0.1) (2026-07-02)


### Documentation

* curate 6.0.0 changelog release notes ([52f2141](https://github.com/CourtHive/competition-factory/commit/52f2141b5c7b351925cd2c99f721b76bb11958ca))
* **query-governor:** document getMatchUpFormatVariance ([934d534](https://github.com/CourtHive/competition-factory/commit/934d53422e00b9c9c859f997831d9d00e82cb938))

## [6.0.0](https://github.com/CourtHive/competition-factory/compare/v5.9.0...v6.0.0) (2026-07-02)

This is a **major** release. The version bump is driven by two breaking changes to rating
computation and participant birth-date storage (below). The headline _feature_ is a new
**data-integrity query hierarchy** that scans a tournament for contradictory state at the structure,
draw, event, and tournament levels.

### ⚠ BREAKING CHANGES

- **scales:** `generateDynamicRatings({ considerGames: true })` now normalises by the true maximum countable games (`bestOf * setTo`) rather than the previous ~1. Ratings computed with `considerGames: true` will change — the new values are correct, the old ones were not. Only callers that opted into `considerGames: true` are affected; re-baseline against the new values (no code change required). ([49b518e](https://github.com/CourtHive/competition-factory/commit/49b518eb5797b7c520abd1da1a9c66b099ff2ca8))
- **participants:** `modifyParticipant` now reads and writes the canonical `person.birthDate` (camelCase) instead of the previous non-canonical `person.birthdate`. Callers reading or writing the lowercase field must switch to `person.birthDate`. ([36fe9c5](https://github.com/CourtHive/competition-factory/commit/36fe9c5052b0776cbb758335a3a0cc6409753c53))

### Features

- **query — data-integrity query hierarchy (draw/event/tournament):** a read-only integrity surface that answers _"is this tournament's decided state self-consistent?"_ without loading a full engine — useful at publish checkpoints, in CI, and when validating draw records reconstructed by hand (third-party ingest). Every finding carries `severity`, `scope`, provenance ids, and a stable dedup `fingerprint`.
  - `getStructureInconsistencies` / `getStructureCompleteness` (leaf) — decided-state invariants and outstanding-work reporting; adds `DRAW_POSITION_UNASSIGNED` (stored-state phantom position) and `WINNER_NOT_ADVANCED` (winner absent from its next matchUp within the structure), plus a CI corpus sweep across every draw type × sizes 8/16/32/64.
  - `getDrawInconsistencies` / `getDrawCompleteness` — cross-structure **link** integrity (`DANGLING_LINK`, `LINK_MISSING_SOURCE_ROUND`) and **progression** (`DROPPED_PROGRESSION`): a loser or winner _eligible_ to feed a linked target structure but absent from it. Eligibility reuses the engine's own feed logic (`getDrawPositionWinCount`, shared with the mutation path), so first-match-loser-consolation and double-elimination feed-back are handled correctly. ([71f457c](https://github.com/CourtHive/competition-factory/commit/71f457c679dea4740f71063695869b7479871157), [d494b5a](https://github.com/CourtHive/competition-factory/commit/d494b5a067a2eaf42d3f59ff3beaca15b78b63f2))
  - `getEventInconsistencies` / `getEventCompleteness` — `eventType` ↔ `participantType` coherence.
  - `getTournamentInconsistencies` / `getTournamentCompleteness` — cross-event checks (a person represented by two distinct **individual** participants; a person legitimately appearing across multiple pair/team groupings is not flagged). ([33e8b01](https://github.com/CourtHive/competition-factory/commit/33e8b013bac4855e908c6c520678dbe3e77dc573), [bed00cd](https://github.com/CourtHive/competition-factory/commit/bed00cd566ad66db9783de7e3463b6fab35f984c), [4e53697](https://github.com/CourtHive/competition-factory/commit/4e536971bf3b4e90f777cfaef03ec3858e46f38a))
- **query:** `getMatchUpFormatVariance` — report matchUpFormat variance across a draw's structures; round-robin group structures are now correctly exempt from the ascending-drawPositions-sort inconsistency check (Berger round-pairing order is legitimate). ([0132a04](https://github.com/CourtHive/competition-factory/commit/0132a04ed0ab7b5c64a03b4f061870ddfb5a0244))
- `abandonTournamentMatchUps` — bulk-abandon still-playable matchUps. ([f092322](https://github.com/CourtHive/competition-factory/commit/f092322373e572ac9ad11653a49661334dac753b))

### Bug Fixes

- **exit propagation:** a cluster of fixes to how WALKOVER/DEFAULTED statuses cascade through consolation byes and unwind on removal — re-derive winningSide/exit codes on advancement, clear stale codes when a pending propagated exit is removed, block reset of a source whose exit resolved downstream, gate `propagateExitStatus` by scoring policy. ([97fc07b](https://github.com/CourtHive/competition-factory/commit/97fc07b12619349a25e62c118d2e0c7349e06707), [bca7d11](https://github.com/CourtHive/competition-factory/commit/bca7d113e6c83cf9750f3dc92688dc4ad2190162), [cf091d7](https://github.com/CourtHive/competition-factory/commit/cf091d73e3015909801951a060e222155dbb0d9e), [44ac5b2](https://github.com/CourtHive/competition-factory/commit/44ac5b2791a48a3806dc0b016f7d4bb5a49b4171), [b49f4aa](https://github.com/CourtHive/competition-factory/commit/b49f4aa3841fa1f60d23fce85ec97f072ddcac94), [241cac9](https://github.com/CourtHive/competition-factory/commit/241cac99759879bfa7e66da3df593905e819fc88))
- **matchUps / events:** enforce mixed-doubles second-participant gender; age-check individual members of PAIR/TEAM entries; block un-assigning participants from completed ad-hoc matchUps. ([68d7834](https://github.com/CourtHive/competition-factory/commit/68d7834391bb916d615ef78571646b54370db5fd), [ce24d5d](https://github.com/CourtHive/competition-factory/commit/ce24d5d3796b268b4e2cccf88f659938e6fdd8aa), [88f2ba2](https://github.com/CourtHive/competition-factory/commit/88f2ba2017f9518bf20c52e3c557f43df9e7c19b))
- **tieFormat:** preserve existing `collectionGroups` when adding a group. ([bb6cfde](https://github.com/CourtHive/competition-factory/commit/bb6cfde857bd61893d56533ca2a84b13b4b8d5b7))
- **schedule:** dedupe venue-data lookups by the correct `venueId`. ([618efd9](https://github.com/CourtHive/competition-factory/commit/618efd9e11cf3fcfbe0efb15fc58650b94c14b19))
- Various `matchUps` / `participants` reference and canonicalisation fixes. ([61de73b](https://github.com/CourtHive/competition-factory/commit/61de73b50cf15e531bc4448dc79c971f2e08ed41), [b37564d](https://github.com/CourtHive/competition-factory/commit/b37564d2871a13462c32f862c868cecee1900900), [7e22bf3](https://github.com/CourtHive/competition-factory/commit/7e22bf3ee3733ee2de21ea8097dd0a71bd23a81b), [61012e3](https://github.com/CourtHive/competition-factory/commit/61012e371d5847fa22ce3f0ef8a4590b52425937))

### Upgrading

Bump `tods-competition-factory` to `^6.0.0` in every consumer (TMX, competition-factory-server, courthive-public, courthive-components, rankings). Re-baseline any `considerGames: true` rating output and migrate `person.birthdate` → `person.birthDate`. The integrity query hierarchy is purely additive — no action required to adopt it.

## [5.9.0](https://github.com/CourtHive/competition-factory/compare/v5.8.0...v5.9.0) (2026-06-29)

### Features

- **matchUps:** setDelegatedOutcome accepts canonical outcome ([2d068db](https://github.com/CourtHive/competition-factory/commit/2d068db5858991e15370cc0c146388f8045ff991))

## [5.8.0](https://github.com/CourtHive/competition-factory/compare/v5.7.1...v5.8.0) (2026-06-28)

### Features

- **setTournamentDates:** block changes that orphan scheduled matchUps; add force override ([03f8f84](https://github.com/CourtHive/competition-factory/commit/03f8f84874e7c984f8d6457613d6a5eb58bb2378))

### Documentation

- pnpm install allowed (npm still blocked) ([7440e94](https://github.com/CourtHive/competition-factory/commit/7440e944cad1bbec852f92f5a4e1ccc918662732))

## [5.7.1](https://github.com/CourtHive/competition-factory/compare/v5.7.0...v5.7.1) (2026-06-23)

### Bug Fixes

- **deps:** update courthive-components to 3.4.4 in documentation ([7efaaf3](https://github.com/CourtHive/competition-factory/commit/7efaaf336241f36cab1494de5e9616223e2b00c5))
- FMLC walkover propagated against a consolation BYE advances the WO player ([#4455](https://github.com/CourtHive/competition-factory/issues/4455)) ([7ca7973](https://github.com/CourtHive/competition-factory/commit/7ca7973679f327960d8a3f3631754ed9547fd8fc))
- guard getExitWinningSide against bye positions and drop dead double-exit code ([#4456](https://github.com/CourtHive/competition-factory/issues/4456)) ([92eae1e](https://github.com/CourtHive/competition-factory/commit/92eae1e377fd3ad0dd3fc336d76381722b2ea277))

## [5.7.0](https://github.com/CourtHive/competition-factory/compare/v5.6.0...v5.7.0) (2026-06-23)

### Features

- **schedule:** auto-capture matchUp.schedule.scoredTime on first score ([#4451](https://github.com/CourtHive/competition-factory/issues/4451)) ([b330ced](https://github.com/CourtHive/competition-factory/commit/b330ced061cc73a6b939aa328fc66526be9a7eee))

## [5.6.0](https://github.com/CourtHive/competition-factory/compare/v5.5.0...v5.6.0) (2026-06-13)

### Features

- **anonymize:** attach mock parentOrganisation when provided ([d6c4f2e](https://github.com/CourtHive/competition-factory/commit/d6c4f2e0a5dd12850c11cb6ba25cac1cc75bd614))

### Bug Fixes

- **participants:** default entries to [] so getParticipants survives sparse records ([3f0c31f](https://github.com/CourtHive/competition-factory/commit/3f0c31f0a63b85b97df12019d3fc2d2e242d67ac))

## [5.5.0](https://github.com/CourtHive/competition-factory/compare/v5.4.0...v5.5.0) (2026-06-12)

### Features

- **structures:** add updateParticipantResults mutation ([9ae4f8c](https://github.com/CourtHive/competition-factory/commit/9ae4f8ce49e052c526de7fbcbef829a67edfd451))

### Bug Fixes

- **docs:** bump tods-competition-factory caret to 5.4.0 ([d2d4e9f](https://github.com/CourtHive/competition-factory/commit/d2d4e9f1a6e40ef4c0a2d8a128a1caef018766cf))
- **test:** cast partial mappedMatchUps literals in coverageBranchTargets ([e0fcbfd](https://github.com/CourtHive/competition-factory/commit/e0fcbfd7e30dd1e1dfe516c8a908744376f28128))
- **test:** move `any` annotation onto mappedMatchUps binding instead of literal ([2fbb781](https://github.com/CourtHive/competition-factory/commit/2fbb7814696303798cc1437737460cbd2cf67b3a))

### Documentation

- **format-wizard:** unlink stub references until distribution + example publish ([6652b2d](https://github.com/CourtHive/competition-factory/commit/6652b2de45a9ba574bb10ff1a2316da2c8df51fd))
- **sidebar:** regroup State Engines, Concepts, Governors; consolidate syntax ([8ed8d00](https://github.com/CourtHive/competition-factory/commit/8ed8d0089496ac1c2cf1ac895eca9fc8ed0332ca))

## [5.4.0](https://github.com/CourtHive/competition-factory/compare/v5.3.0...v5.4.0) (2026-06-08)

### Features

- **query:** propagate tournamentTier through getTournamentInfo ([baa7d42](https://github.com/CourtHive/competition-factory/commit/baa7d4272275de281bd66d3ed55878765b38804d))

### Bug Fixes

- **docs:** bump tods-competition-factory caret to 5.3.0 ([25d54de](https://github.com/CourtHive/competition-factory/commit/25d54de6ccab162527a2a19ce7ad9e1357fb23d0))

## [5.3.0](https://github.com/CourtHive/competition-factory/compare/v5.2.5...v5.3.0) (2026-06-08)

### Features

- **mutate:** modifyEvent accepts competitionFormat in eventUpdates ([41dffee](https://github.com/CourtHive/competition-factory/commit/41dffee7ec63d5c3cb63dd12a2b49f127ad6048d))
- **query:** hydrate competitionFormat onto eventInfo in getEventData ([cd189c8](https://github.com/CourtHive/competition-factory/commit/cd189c81102c3eeab4dfd55ccb3d7b4df9d0e940))
- **sync:** port nonRandom middleware from mocksEngine to syncEngine ([#4428](https://github.com/CourtHive/competition-factory/issues/4428)) ([1f1c65b](https://github.com/CourtHive/competition-factory/commit/1f1c65b65210546427aea6cdf92996e2ff1cf485))

## [5.2.5](https://github.com/CourtHive/competition-factory/compare/v5.2.4...v5.2.5) (2026-06-07)

### Bug Fixes

- **query:** preserve hydrated schedule under NATIVE mode (matchUp.schedule clobber) ([#4423](https://github.com/CourtHive/competition-factory/issues/4423)) ([8847e2e](https://github.com/CourtHive/competition-factory/commit/8847e2eaa2da5b49234cb3d1d8db967a0723042e))

## [5.2.4](https://github.com/CourtHive/competition-factory/compare/v5.2.3...v5.2.4) (2026-06-04)

### Bug Fixes

- **mocksEngine:** generate balanced M+F PAIRs for MIXED DOUBLES ([576d9b1](https://github.com/CourtHive/competition-factory/commit/576d9b12c5bb1b3393ee2ba2c304e5fe75af54ad))
- **mocksEngine:** treat gender:ANY as no-op constraint when synthesizing draws ([05fe8a5](https://github.com/CourtHive/competition-factory/commit/05fe8a5bb96b4893f4f11953785c4ea8de90806b))
- **mocksEngine:** treat gender:MIXED on SINGLES as no individual-level constraint ([7feabdc](https://github.com/CourtHive/competition-factory/commit/7feabdc0885a7eeedac8165935e26d1a54afc0ef))
- **scales:** make doublesAttribution a single-owner choice — pair OR individuals, never both ([d92d1a0](https://github.com/CourtHive/competition-factory/commit/d92d1a0de2dea3e790b923bb8a4127a0973a39ef))

### Documentation

- **scale-engine:** align doubles attribution page with single-owner contract ([d60f224](https://github.com/CourtHive/competition-factory/commit/d60f22425060326377adb9a644784c1bd7a7fe99))

## [5.2.3](https://github.com/CourtHive/competition-factory/compare/v5.2.2...v5.2.3) (2026-06-03)

### Bug Fixes

- **generate-draw-definition:** support adding qualifying to existing main + cross-stage drawEntries ([7fab28d](https://github.com/CourtHive/competition-factory/commit/7fab28d09b534cff0f66b5d35c1c8e1b1c1665b6))

## [5.2.2](https://github.com/CourtHive/competition-factory/compare/v5.2.1...v5.2.2) (2026-06-02)

### Documentation

- **readme:** availability-engine rename, pnpm, current test count ([16a9f86](https://github.com/CourtHive/competition-factory/commit/16a9f86036d6fe67a247fbedd9112026e0510794))
- **verify:** reflect 11-check chain + opt-in verify:ecosystem ([0f7a8b2](https://github.com/CourtHive/competition-factory/commit/0f7a8b2f1a047bad33ce6f7593723fa58c4522c0))

## [5.2.1](https://github.com/CourtHive/competition-factory/compare/v5.2.0...v5.2.1) (2026-06-02)

### Bug Fixes

- **release:** cut 5.2.1 to re-trigger publish ([706a628](https://github.com/CourtHive/competition-factory/commit/706a628ad60f7cf958a0d1c8ce36e7d93d72eebb))

## [5.2.0](https://github.com/CourtHive/competition-factory/compare/v5.1.0...v5.2.0) (2026-06-02)

### Features

- **lucky-draw:** customLuckyDraw generator with explicit roundProfile ([cc4bd23](https://github.com/CourtHive/competition-factory/commit/cc4bd23dad6baf5ac9085b8d53fe59f585f698a9))

## [5.1.0](https://github.com/CourtHive/competition-factory/compare/v5.0.0...v5.1.0) (2026-06-01)

### Features

- **engines:** export competitionEngineAsync + tournamentEngineAsync from public index ([08ae91b](https://github.com/CourtHive/competition-factory/commit/08ae91b53baea28cffe477474bfa1687065b2c87))
- **practice:** add practice court registration governor ([08abdf9](https://github.com/CourtHive/competition-factory/commit/08abdf9516047a484c25daad2f188c62b6b8e44b))
- **practice:** register setPracticeDefaultCapacity in engine method lists ([d00f2ec](https://github.com/CourtHive/competition-factory/commit/d00f2ec2f51707bd5a2e7a06065437a324d4d334))
- **practice:** setPracticeDefaultCapacity tournament-wide setting ([480499b](https://github.com/CourtHive/competition-factory/commit/480499b98405f5a576166a6b8bf30d49d7cceec9))

### Bug Fixes

- **modifyCourtAvailability:** ignore completed matchUps in conflict check ([5ca4cad](https://github.com/CourtHive/competition-factory/commit/5ca4cad0fed153561e1b2ea24e57268a27eed7f0))

## [5.0.0](https://github.com/CourtHive/competition-factory/compare/v4.2.0...v5.0.0) (2026-05-31)

### ⚠ BREAKING CHANGES

- **types:** tournamentEngine / competitionEngine typed by default
- rename TemporalEngine to AvailabilityEngine for 5.0.0
- drawDeletions opt-in + server-authoritative gating (CODES Phase 6)
- in NATIVE mode (default) consumers reading raw `tournamentRecord.extensions[]` for `SCHEDULING_PROFILE`, `SCHEDULE_LIMITS`, or tournament-level `SCHEDULE_TIMING` will find nothing. Read `tournamentRecord.scheduling.profile / .dailyLimits / .timing` directly, or use `firstClassGroupLeafOrExtension` for mode-agnostic reads, or set `engine.schemaWriteMode('legacy'|'dual')`.
- in NATIVE mode (default) consumers reading raw `.extensions[]` for any of the 8 promoted names will find nothing. Migrate to reading the first-class attribute, or set `engine.schemaWriteMode('legacy'|'dual')` at startup.
- in NATIVE mode (default) consumers reading raw `event.extensions[]` for `flightProfile` or `drawDefinition.extensions[]` for `lineUps` will find nothing. Read `event.flightProfile` and `drawDefinition.lineUps` directly, or use `firstClassOrExtension` for mode-agnostic reads, or set `engine.schemaWriteMode('legacy'|'dual')`.
- in NATIVE mode consumers reading raw matchUp.timeItems[] for SCHEDULED_DATE / SCHEDULED_TIME / ASSIGN_COURT / ASSIGN_VENUE / COURT_ORDER / COURT_ANNOTATION / ALLOCATE_COURTS / TIME_MODIFIERS / HOME_PARTICIPANT_ID / ASSIGN_OFFICIAL must migrate to reading `matchUp.schedule.<attribute>` (already the canonical hydrated shape) or switch the engine to LEGACY/DUAL mode.
- in NATIVE mode (default) consumers reading the round-robin tally must access `positionAssignment.tally.*` or use `firstClassOrExtension` — the legacy `findExtension({element, name: 'tally'})` lookup returns `undefined` because no extension is written. Same for `subOrder`. Consumers needing the old behavior must set `engine.schemaWriteMode('legacy')` or `'dual'`.
- engine default write behavior switches to NATIVE for v5.0.0. Consumers that rely on the legacy `_name` flattened attributes on read are unaffected (hydration shim continues to work); consumers that read raw `element.extensions[]` for tracked internal extensions must call `engine.schemaWriteMode('legacy')` or `'dual'`, or migrate to reading the first-class attribute.

### Features

- CODES Phase 7 — migrateTournamentRecord upgrade utility ([d8801bd](https://github.com/CourtHive/competition-factory/commit/d8801bd7f1eb2f221778ac975469ee928a27e90b))
- drawDeletions opt-in + server-authoritative gating (CODES Phase 6) ([a671b7b](https://github.com/CourtHive/competition-factory/commit/a671b7b3d2a146ca86daf5a01ace3bc6d9c14787))
- engine.q unwrap facade + engine.inspect — developer-JOY prototypes ([7bd9c59](https://github.com/CourtHive/competition-factory/commit/7bd9c5976f76543cbaae48cf616362f107853534))
- engine.q unwrap facade + engine.inspect (developer-JOY prototypes) ([2b555df](https://github.com/CourtHive/competition-factory/commit/2b555dfa370e58050327a4bc6585c02bf52bc719))
- **errors:** factoryError class hierarchy with cause + suggestions ([#7](https://github.com/CourtHive/competition-factory/issues/7)) ([6025279](https://github.com/CourtHive/competition-factory/commit/6025279caa4de502c7279dce156007124441d166))
- **forge,errors:** unwrapOr + seeded default suggestions ([16ce0e4](https://github.com/CourtHive/competition-factory/commit/16ce0e476e38b1590fb3544b761749e6658eeaca))
- **forge:** dryRun + explain + RFC 6902 jsonPatch generator ([#3](https://github.com/CourtHive/competition-factory/issues/3), [#12](https://github.com/CourtHive/competition-factory/issues/12)) ([56d02a5](https://github.com/CourtHive/competition-factory/commit/56d02a5297d30188fd5ad7009aa352ceca67a7a9))
- **forge:** expose enforceGender/enforceCategory on builder entries ([e31f887](https://github.com/CourtHive/competition-factory/commit/e31f8873e960f085aae6226847ab2e5fc7332f0d))
- **forge:** fluent builders engine.build.event/participant ([#6](https://github.com/CourtHive/competition-factory/issues/6)) ([077093a](https://github.com/CourtHive/competition-factory/commit/077093ad08f865b1948bfd5c1855385a2308bab9))
- **forge:** typed event bus engine.on/once/off/waitFor ([#5](https://github.com/CourtHive/competition-factory/issues/5)) ([fed19b7](https://github.com/CourtHive/competition-factory/commit/fed19b71e88b47aba30b7ea10487b0fb649adcb6))
- **forge:** unwrap(result) — throwing companion to engine.q.\* ([#2](https://github.com/CourtHive/competition-factory/issues/2) throw) ([c80d0d3](https://github.com/CourtHive/competition-factory/commit/c80d0d328e50d51f54165a0c9da533d2beb941b1))
- getTally engine query for mode-agnostic positionAssignment.tally read ([5c68df0](https://github.com/CourtHive/competition-factory/commit/5c68df07bef29e121cb306cc828d0f8cf6623025))
- getTally engine query for mode-agnostic positionAssignment.tally read ([6e17689](https://github.com/CourtHive/competition-factory/commit/6e17689cb93cc1849ef63796939ecbdabfc64855))
- introduce schemaWriteMode flag (CODES Phase 0) ([bc82bf1](https://github.com/CourtHive/competition-factory/commit/bc82bf1198c9524a8ad4c1258047ae8640551502))
- introduce tournamentRecord.scheduling group leaf (CODES Phase 5) ([ed118c8](https://github.com/CourtHive/competition-factory/commit/ed118c8dde6892cb0e0012f2639d8ab77ed2c219))
- linkedTournamentIds mode-aware writers + readers (CODES Phase 7 follow-up) ([e6daf32](https://github.com/CourtHive/competition-factory/commit/e6daf32aa9480548e620c7efbd809be943439031))
- linkedTournamentIds mode-aware writers + readers (CODES Phase 7 follow-up) ([ff93866](https://github.com/CourtHive/competition-factory/commit/ff93866858b2c74c8e902feeb9976ea5579880b0))
- matchUp.schedule.calledAt + setMatchUpCalledAt mutation ([809574f](https://github.com/CourtHive/competition-factory/commit/809574f478e50bad4da93dc15d2b216dd3cbbf7e))
- matchUp.schedule.calledAt + setMatchUpCalledAt mutation ([3ed498f](https://github.com/CourtHive/competition-factory/commit/3ed498f5ec496b6ee1db04c7de278b58e968001d))
- **matchUpFormat:** add WB&lt;n&gt; win-by modifier for no-tiebreak sets ([9b4b9bc](https://github.com/CourtHive/competition-factory/commit/9b4b9bc619d0f990decb2a669120d275fe27a646))
- migrateTournamentRecord one-shot CODES upgrade utility (Phase 7) ([6f8ea48](https://github.com/CourtHive/competition-factory/commit/6f8ea485738962775a14510f51561bf8d6578043))
- **participantRoles:** add TRAINER and PHYSIO as distinct roles ([bb13b73](https://github.com/CourtHive/competition-factory/commit/bb13b7383973076a8a27ae5b5e2b2dd32bc2bcae))
- **participants:** add addPersonOtherId mutation (HiveID PR-K) ([54846e2](https://github.com/CourtHive/competition-factory/commit/54846e2bbe50fdb0d9dcb96ddc50f49683dcfb90))
- **policy:** policyComposer — fluent merger over PolicyDefinition shapes ([60e8d47](https://github.com/CourtHive/competition-factory/commit/60e8d471e647f9dc247dcf86898f547145f2649b))
- promote flat scalar / object extensions (CODES Phase 4) ([a6aa8a6](https://github.com/CourtHive/competition-factory/commit/a6aa8a6a4e6d8af3526a5d0208f024f4a3a19680))
- promote flightProfile + lineUps to first-class (CODES Phase 3) ([d62dc6c](https://github.com/CourtHive/competition-factory/commit/d62dc6cd9f0bb0d9bcb0c4d2b092cc7b4917494c))
- promote matchUp.schedule.\* to first-class attributes (CODES Phase 2) ([8619066](https://github.com/CourtHive/competition-factory/commit/86190665b5b715fd00115f35545d6fc7d0b43cef))
- promote tally + subOrder to first-class on PositionAssignment (CODES Phase 1) ([d6891f8](https://github.com/CourtHive/competition-factory/commit/d6891f8ddb586ec9405dfca90a24085fabca684e))
- **types:** drawDefinition.flightNumber as first-class field ([b1766ca](https://github.com/CourtHive/competition-factory/commit/b1766cac58d1c982ce676ac5d75c10ec3fff9e95))
- **types:** engineMethod wrapper relaxes engine call shape ([18fe209](https://github.com/CourtHive/competition-factory/commit/18fe20970f5aa069dfcb5b8ae48037584e5b04c2))
- **types:** expand MethodSignatures to ~90% of engine surface ([eb2a049](https://github.com/CourtHive/competition-factory/commit/eb2a049ec1ac6664a08f8fe7a25f5d499f8cd474))
- **types:** per-method typed signatures v1 (joy [#1](https://github.com/CourtHive/competition-factory/issues/1)) ([dbb1ea6](https://github.com/CourtHive/competition-factory/commit/dbb1ea6774a731687cbbc88c72784205c2c3f8d8))
- **types:** tournamentEngine / competitionEngine typed by default ([6905911](https://github.com/CourtHive/competition-factory/commit/6905911204508b94214a3a9ad5c6a2fb612b70e0))
- **verify:** close three gaps; replace agadoo with publint ([c3f5fe9](https://github.com/CourtHive/competition-factory/commit/c3f5fe9bfab91490980ad73be7601c018ec5a6c5))
- **verify:** full pre-publish verification suite + CI gate ([76258f5](https://github.com/CourtHive/competition-factory/commit/76258f510d8ea7a13637951e7f15b76848625d0f))

### Bug Fixes

- **matchUpFormat:** honor setFormat.winBy in validator + smart complement ([b811d8e](https://github.com/CourtHive/competition-factory/commit/b811d8e9a0cc558e0f7f03481ded5a9767cdf428))
- **matchUpFormat:** stringify WB regardless of explicit noTiebreak flag ([5a2b80e](https://github.com/CourtHive/competition-factory/commit/5a2b80e6d2bd8becbefe53cf12ba0867de72e053))
- **schedule:** scheduledMatchUpDate reads first-class with timeItem fallback ([86357c0](https://github.com/CourtHive/competition-factory/commit/86357c0f4ffb07057c8106229172071ab384d77c))
- **schedule:** scheduledMatchUpDate reads first-class with timeItem fallback ([0fb661b](https://github.com/CourtHive/competition-factory/commit/0fb661bc8ccdc73439119ca584efd3bf15b6f997))
- **test:server:** add @Forge alias to tsconfig.base.json ([6caff47](https://github.com/CourtHive/competition-factory/commit/6caff473bb9ae4ea6036909ea6768433e9b0b0fe))
- **types:** engineMethod must not distribute over `T | undefined` ([9630176](https://github.com/CourtHive/competition-factory/commit/9630176016ffa16cb7f3a1c8859099868da3d90f))
- **types:** hydratedMatchUp parent-context fields as required + audit 13 sites ([c9cae63](https://github.com/CourtHive/competition-factory/commit/c9cae6322fa882965cb962a1c21d534b9d5e48fa))

### Documentation

- :memo: doc update ([477961f](https://github.com/CourtHive/competition-factory/commit/477961fe4e1435441e824deddf3fd87618cd6114))
- :memo: doc update ([3ff43a7](https://github.com/CourtHive/competition-factory/commit/3ff43a73e2cd8005ba4671b2e6ed1f2a66d98af3))
- 4.x to 5.0.0 consumer migration guide ([0195df5](https://github.com/CourtHive/competition-factory/commit/0195df5c162c15e3657388997dec1d6caea48010))
- 4.x to 5.0.0 consumer migration guide ([4d5c581](https://github.com/CourtHive/competition-factory/commit/4d5c581bff91827bcbcbc5c2ed25b38bd8419dd1))
- **5.0.0:** whats-new showcase + JOY feature pages ([c720843](https://github.com/CourtHive/competition-factory/commit/c7208436514ae73a3d367bd4c5ce312537fc585f))
- **concepts:** add Provider Theming page ([4c5e4b8](https://github.com/CourtHive/competition-factory/commit/4c5e4b87d7d566dc03adb10f0dc66b763260b542))
- **engines:** backfill pages for engine.q and engine.inspect ([766f0c7](https://github.com/CourtHive/competition-factory/commit/766f0c71fe3a54d711cac3f652521622fab8fecb))
- expand linkedTournamentIds migration explanation ([30e462e](https://github.com/CourtHive/competition-factory/commit/30e462e69260f13be655e339d6725a09ce175081))
- **migration:** add 2.x to 3.x and 3.x to 4.x migration pages ([cd2cd6e](https://github.com/CourtHive/competition-factory/commit/cd2cd6e32de59389c3d8a4cb05e1db0ec3db8c92))
- **migration:** typed engine default + Untyped opt-out top-line in 5.0.0 ([b019425](https://github.com/CourtHive/competition-factory/commit/b019425124ac08dd3bdc3d28fd7b247561cc53e5))
- remove Provider Theming page — belongs in CFS docs, not factory ([f020a99](https://github.com/CourtHive/competition-factory/commit/f020a99b4278e843a8b3bee570c94f065823171a))

### Refactor

- rename TemporalEngine to AvailabilityEngine for 5.0.0 ([0a36534](https://github.com/CourtHive/competition-factory/commit/0a365347eb43d0b02eea970a4ab406f1d35d1453))

## [4.2.0](https://github.com/CourtHive/competition-factory/compare/v4.1.1...v4.2.0) (2026-05-24)

### Features

- **participants:** optional Person.birthYear with age/category fallback (CODES) ([#4374](https://github.com/CourtHive/competition-factory/issues/4374)) ([58698d2](https://github.com/CourtHive/competition-factory/commit/58698d26e68cf90ab2ff7ff24f9bd228016122f2))
- **scales:** fall back to tier.numericRank when a policy declares no tierToLevel ([#4373](https://github.com/CourtHive/competition-factory/issues/4373)) ([40582fa](https://github.com/CourtHive/competition-factory/commit/40582fa029e5d8469c5efaa1b526e987964e1a5a))

### Documentation

- correct site url to courthive.github.io ([#4370](https://github.com/CourtHive/competition-factory/issues/4370)) ([42016fb](https://github.com/CourtHive/competition-factory/commit/42016fb9fd2414204c76fbabd650de43a011c534))

## [4.1.1](https://github.com/CourtHive/competition-factory/compare/v4.1.0...v4.1.1) (2026-05-24)

### Bug Fixes

- **mocks:** gender-filter preset participants across multi-gender events ([a03929f](https://github.com/CourtHive/competition-factory/commit/a03929fd0e06a1baa82231e3177e128e9675516f))
- **scheduling:** base court-grid row floor on unplaced matchUps only ([747e641](https://github.com/CourtHive/competition-factory/commit/747e6412c04ad9e6abe3742a7498aa027395f8f2))

### Documentation

- :memo: doc update ([8959bea](https://github.com/CourtHive/competition-factory/commit/8959bea9d9e6a95d477845a8d52d5abceef89e86))

## [4.1.0](https://github.com/CourtHive/competition-factory/compare/v4.0.0...v4.1.0) (2026-05-21)

### Features

- **policies:** add pointsAuthority on ranking policies and emitted awards ([b02f50b](https://github.com/CourtHive/competition-factory/commit/b02f50b94e299ac7d49ae39db583961e0760666e))
- **policies:** hybrid example fixture + stage field on emitted awards ([fc02f06](https://github.com/CourtHive/competition-factory/commit/fc02f06338f690718ecb8f01c13f6040b50c265a))
- **policies:** per-AwardProfile pointsAuthority override ([1bbbc9c](https://github.com/CourtHive/competition-factory/commit/1bbbc9cc537894093a3390a952d2e8f943b755ea))

### Bug Fixes

- **deps:** update dependency tods-competition-factory to v4.0.0 ([da2ee74](https://github.com/CourtHive/competition-factory/commit/da2ee74828c103ef3f3e4eaa495c9bd93b5b55ac))
- **tests:** make seedAvoidance.test.ts non-flaky ([aac8483](https://github.com/CourtHive/competition-factory/commit/aac848331aeea9e4681de9881b721fa34fdc0dbe))

## [4.0.0](https://github.com/CourtHive/competition-factory/compare/v3.9.0...v4.0.0) (2026-05-20)

### ⚠ BREAKING CHANGES

- **policies:** the following policies are no longer exported from `tods-competition-factory`:

### Features

- **policies:** cts article 21 qualifying-stage award profiles ([#4360](https://github.com/CourtHive/competition-factory/issues/4360)) ([32d87ed](https://github.com/CourtHive/competition-factory/commit/32d87ed11520fef0996cc0439aeb428b64a141e5))
- **policies:** export policyRegistry from public api ([5ce8ad2](https://github.com/CourtHive/competition-factory/commit/5ce8ad237168ba507698e5609686336337d31770))
- **policies:** introduce policyRegistry as engine indirection point ([6705367](https://github.com/CourtHive/competition-factory/commit/67053672fd88aae33306d200533a9f971d0e0989))
- **policies:** remove federation ranking-point fixtures from bundle ([1f8ea0c](https://github.com/CourtHive/competition-factory/commit/1f8ea0cc07f192f7c0db8b90db4b1d4c58cd0e55))
- **tournaments:** reject orphaning setTournamentCategories ([b607f8a](https://github.com/CourtHive/competition-factory/commit/b607f8aba730c5d3ee88f7986cf2f6cde38b3891))

### Documentation

- **policies:** align ranking docs with 4.0.0 fixture set ([aaef9d7](https://github.com/CourtHive/competition-factory/commit/aaef9d7601393828fe805c43f8bb8b9b2bd89e00))

## [3.9.0](https://github.com/CourtHive/competition-factory/compare/v3.8.0...v3.9.0) (2026-05-19)

### Features

- **mocks:** support preset participants in generateTournamentRecord ([e8ab280](https://github.com/CourtHive/competition-factory/commit/e8ab28015ca6bc7f6cbf5d790f2076a4cd830f80))
- **participants:** add PAYMENT_STATUS as a participant timeItem ([6dd9fb2](https://github.com/CourtHive/competition-factory/commit/6dd9fb280c5d7ecae5e570945f262c63cd51895a))
- **policies:** encode CTS Tabulka IV — 21 categories × singles+doubles ([c6cff55](https://github.com/CourtHive/competition-factory/commit/c6cff55d25192af439fa6859a6fd626ddfe74065))

### Documentation

- **mocks:** expand preset participants documentation ([cd0791d](https://github.com/CourtHive/competition-factory/commit/cd0791d6f2da2c003bbd227b7151205192f62853))

## [3.8.0](https://github.com/CourtHive/competition-factory/compare/v3.7.0...v3.8.0) (2026-05-18)

### Features

- **types:** expose FactoryEngineTyped to catch unregistered method calls ([8aa1cc7](https://github.com/CourtHive/competition-factory/commit/8aa1cc7f6dbbe96be2355b106bee8872053f6e7c))

### Bug Fixes

- **types:** allow multi-arg methods in FactoryEngineTyped ([be1bcdf](https://github.com/CourtHive/competition-factory/commit/be1bcdfb0732d2a271ae16c2bec7cec42faf14f7))

## [3.7.0](https://github.com/CourtHive/competition-factory/compare/v3.6.0...v3.7.0) (2026-05-18)

### Features

- **fixtures:** encode per-federation ranking policies (Phase 0 PR 0.5) ([362cb03](https://github.com/CourtHive/competition-factory/commit/362cb03f1d62dd5c0b12f9e9c9fd65aba114e8bd))
- **query:** expose computeRatingDistributionStats as a top-level export ([13a5dbc](https://github.com/CourtHive/competition-factory/commit/13a5dbcbe60f72e782989bbe935dd46d3b90a6ea))
- **ranking:** add applyDerivedRankings for filtered sub-rankings ([fa3e439](https://github.com/CourtHive/competition-factory/commit/fa3e4399a007afbe40f4b196903609519c9f8669))
- **ranking:** add pointPoolModel, categoryAggregation, derivedRankings types ([050eed0](https://github.com/CourtHive/competition-factory/commit/050eed0df645d945d27d2adc245257fd88835e98))
- **ranking:** add scaleEngine.getTournamentPointAwards() pipeline entry ([3da33ae](https://github.com/CourtHive/competition-factory/commit/3da33aed44a8ce91c82015c0783739f5b021ea35))
- **ranking:** interpret categoryAggregation in generateRankingList ([8fcf3e3](https://github.com/CourtHive/competition-factory/commit/8fcf3e34b9641c3f791ed3c1cfcea19e9e24f83f))

## [3.6.0](https://github.com/CourtHive/competition-factory/compare/v3.5.0...v3.6.0) (2026-05-16)

### Features

- **query:** emit registrationProfile on getTournamentInfo ([ffc63ed](https://github.com/CourtHive/competition-factory/commit/ffc63eddb8554158cc1fea048295456a111e3503))
- **scheduling:** explain-why payloads for over-limit + recovery-deferred jinn refusals ([49d5530](https://github.com/CourtHive/competition-factory/commit/49d55301431b92c3edfcdb5f8b37eb4c7b674077))

## [3.5.0](https://github.com/CourtHive/competition-factory/compare/v3.4.4...v3.5.0) (2026-05-14)

### Features

- **scheduling:** opt-in daily-limit enforcement in pro scheduler ([8eb14f9](https://github.com/CourtHive/competition-factory/commit/8eb14f9115a618dd80b765218606937ee489c4db))

### Bug Fixes

- **scheduling:** exclude completed matchUps from pro-scheduler grid placement ([10ef2f8](https://github.com/CourtHive/competition-factory/commit/10ef2f8737ded49435c139c7fa46bbeaddce2a29))
- **scheduling:** pro scheduler walks earlier scheduled times first ([eb55666](https://github.com/CourtHive/competition-factory/commit/eb556669806e89181f2a3ef70b34fd598677ac6a))

## [3.4.4](https://github.com/CourtHive/competition-factory/compare/v3.4.3...v3.4.4) (2026-05-12)

### Bug Fixes

- **scheduling:** exclude historical/orphan matchUps from daily-limit budget ([2e5d085](https://github.com/CourtHive/competition-factory/commit/2e5d0851b6a6d8bef01056b3da3fd545c9310cd4))

## [3.4.3](https://github.com/CourtHive/competition-factory/compare/v3.4.2...v3.4.3) (2026-05-12)

### Bug Fixes

- **scheduling:** default to POLICY_SCHEDULING_DEFAULT + parse timed formats ([bc37974](https://github.com/CourtHive/competition-factory/commit/bc3797498c4472834ab5bbec0741e22f82c02237))

### Documentation

- **policies:** document withCompetitiveness + inContext:false path ([596995b](https://github.com/CourtHive/competition-factory/commit/596995b567a46856bbeb43ad96d607a234114919))

## [3.4.2](https://github.com/CourtHive/competition-factory/compare/v3.4.1...v3.4.2) (2026-05-09)

### Bug Fixes

- **.npmrc:** rename confirmModulesPurge to confirm-modules-purge ([7bd7e5d](https://github.com/CourtHive/competition-factory/commit/7bd7e5d80de6d65dcd1763f7cd3e1082c8932248))
- **documentation:** unblock pnpm 11 install + Docusaurus build ([eeb9009](https://github.com/CourtHive/competition-factory/commit/eeb9009398c8f6257aca2b70f0226b3b43672aed))

## [3.4.1](https://github.com/CourtHive/competition-factory/compare/v3.4.0...v3.4.1) (2026-05-06)

### Bug Fixes

- **query:** correct polarity in getPredictiveAccuracy ([16815ad](https://github.com/CourtHive/competition-factory/commit/16815ad31d6edaf24f55e799aad401e6caabd97e))
- **query:** correct tiebreak polarity in getCompetitionLeaderboard + cover gaps ([334679b](https://github.com/CourtHive/competition-factory/commit/334679b6505045b541cacee75fe403049b5d7e59))

## [3.4.0](https://github.com/CourtHive/competition-factory/compare/v3.3.1...v3.4.0) (2026-05-05)

### Features

- **format-wizard:** integer match counts, FEED_IN, voluntary consolation, flighting caps ([0cd61da](https://github.com/CourtHive/competition-factory/commit/0cd61daf0fb38a7a55def807d3c36aa8feaab131))
- **query:** :sparkles: enrich matchUps with competitiveProfile without inContext hydration ([997730c](https://github.com/CourtHive/competition-factory/commit/997730c24967166edf8361652ebb235bad5d1df7))
- **query:** predictCompetitiveBands for level-based format wizard ([b512280](https://github.com/CourtHive/competition-factory/commit/b51228091e593aad5e70a35410a9c3d8df18d8b4))
- **query:** suggestFormatPlans engine for level-based format wizard ([557eed2](https://github.com/CourtHive/competition-factory/commit/557eed2c170e046db730c07a2d81647083a90fc5))

### Bug Fixes

- **scheduler:** persist scheduledDate separately in jinnScheduler ([22af38c](https://github.com/CourtHive/competition-factory/commit/22af38cf88db9b4de16a0f3d02d3c3a1e5c69af5))

### Documentation

- **format-wizard:** introduce concept category with engine doc + stubs ([9ee9de9](https://github.com/CourtHive/competition-factory/commit/9ee9de951d49aea85d6e3669bf907bad171c2f70))

## [3.3.1](https://github.com/CourtHive/competition-factory/compare/v3.3.0...v3.3.1) (2026-05-03)

### Bug Fixes

- **reports:** handle walkover outcomes in competitiveness Spread % ([5b9078c](https://github.com/CourtHive/competition-factory/commit/5b9078c870b7fc64501e0d6598dd7bf11a1c8ddf))

## [3.3.0](https://github.com/CourtHive/competition-factory/compare/v3.2.3...v3.3.0) (2026-05-02)

### Features

- **constants:** add POLICY_TYPE_PRINT + default fixture ([cde627e](https://github.com/CourtHive/competition-factory/commit/cde627e6e60473f25514dcd77feb769669bbcca5))

### Bug Fixes

- **deps:** update dependency courthive-components to v1.1.1 ([#4292](https://github.com/CourtHive/competition-factory/issues/4292)) ([3149f75](https://github.com/CourtHive/competition-factory/commit/3149f75d4705a7abee5ab9cfbe85c88d0470fa74))
- **deps:** update docusaurus monorepo to v3.10.1 ([#4290](https://github.com/CourtHive/competition-factory/issues/4290)) ([e0c1fc9](https://github.com/CourtHive/competition-factory/commit/e0c1fc963e5b9f7d393f17c6a4c74d287d45c8cc))

### Documentation

- **policies:** add Print Policy reference page ([2021dcb](https://github.com/CourtHive/competition-factory/commit/2021dcb5bc0c286677004e2ff6f9a8c01b098a92))
- **policies:** rewrite Print Policy to stand alone ([d9a52c9](https://github.com/CourtHive/competition-factory/commit/d9a52c97fa52b9b5151bf3c04cb192bc12c3adbd))
- scrub external repo references for standalone factory docs ([4f7bf1e](https://github.com/CourtHive/competition-factory/commit/4f7bf1e5da74b86b60715f9cb48da4cd5d286bd8))

## [3.2.3](https://github.com/CourtHive/competition-factory/compare/v3.2.2...v3.2.3) (2026-04-30)

### Bug Fixes

- **deps:** update dependency tods-competition-factory to v3.2.2 ([a3e1c58](https://github.com/CourtHive/competition-factory/commit/a3e1c5893c580308d0d3ad46b7f4e870b04e5cac))

## [3.2.2](https://github.com/CourtHive/competition-factory/compare/v3.2.1...v3.2.2) (2026-04-29)

### Bug Fixes

- **deps:** update dependency tods-competition-factory to v3.2.1 ([2b276cd](https://github.com/CourtHive/competition-factory/commit/2b276cdc8631678e31c56a2e03abf868f301b74c))

## [3.2.1](https://github.com/CourtHive/competition-factory/compare/v3.2.0...v3.2.1) (2026-04-29)

### Bug Fixes

- **scheduling:** clear COURT.ORDER timeItem on empty-string + removePriorValues ([17a2d9b](https://github.com/CourtHive/competition-factory/commit/17a2d9b70f9ffffc44172e905f0adaa020ad902a))

## [3.2.0](https://github.com/CourtHive/competition-factory/compare/v3.1.5...v3.2.0) (2026-04-28)

### Features

- **scheduling:** add courtIds filter to scheduleProfileRounds + scheduleProfileGrid ([756da06](https://github.com/CourtHive/competition-factory/commit/756da063f668ee8d05d83a2f3f3fff45b4ccc4bb))

## [3.1.5](https://github.com/CourtHive/competition-factory/compare/v3.1.4...v3.1.5) (2026-04-27)

### Bug Fixes

- **deps:** update dependency tods-competition-factory to v3.1.4 ([714f9cb](https://github.com/CourtHive/competition-factory/commit/714f9cba71c00284244e733d7d538f44c927450a))

### Maintenance

- cut 3.1.5 to validate release-please pipeline ([022b97f](https://github.com/CourtHive/competition-factory/commit/022b97f0f9697f033816eb5aa0ac0b015fd19289))
