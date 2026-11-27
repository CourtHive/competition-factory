<p align="center">
  <a href="https://courthive.com/" target="_blank"><img src="https://raw.githubusercontent.com/CourtHive/competition-factory/6a44786657adfc47825fa4634f94bc2affd805cc/packages/competition-factory/src/fixtures/images/red-ch-logo.png" width="220" alt="CourtHive Logo" /></a>
</p>

# tods-competition-factory continues as competition-factory

> **Coming next:** [`competition-factory`](https://www.npmjs.com/package/competition-factory) replaces
> `tods-competition-factory`. It is being prepared as 8.0.0; until it is published, that name holds a reserved
> placeholder. Keep using `tods-competition-factory` until then, and read the
> [migration guide](https://courthive.github.io/competition-factory/docs/migration-8.0.0) to prepare.

This is the final release of `tods-competition-factory`. The same factory continues under the new name from 8.0.0.

- **Documentation:** <https://courthive.github.io/competition-factory/>
- **Migration guide:** [Migration to 8.0.0](https://courthive.github.io/competition-factory/docs/migration-8.0.0)
- **Source and issues:** <https://github.com/CourtHive/competition-factory>

## What the factory is

The Competition Factory is an engine for running competitions. It creates and changes tournament records: draws,
entries and seeding, scheduling, scoring and results, publishing, rankings and ratings. Every operation is a method
on an engine, and every rule it applies comes from a JSON policy rather than from code, so the same records and the
same results come out wherever it runs: in a browser, on a server, or offline.

- **Configurable.** Sensible defaults for every operation, each replaceable with your own JSON policy.
- **Runs anywhere.** Client, server or both; a complete tournament manager
  [runs in the browser](https://courthive.github.io/TMX). The server engine isolates state per request for
  asynchronous Node.js deployments.
- **Consistent.** The same configuration produces the same structures and results wherever it executes.
- **No runtime dependencies.** Built on platform APIs only.
- **Across sports.** Tennis, padel, pickleball, squash, badminton, beach tennis, wheelchair tennis and more. Scoring
  formats are a compact, parseable grammar (`SET3-S:6/TB7`), so each sport's format is validated data.

## What it covers

- **Draws.** Single and double elimination, round robin (with playoffs), Swiss, feed-in championships, consolation
  formats, compass and Olympic draws, ladders, lucky draws, ad hoc and flexible rounds. Structures link to each other
  by winner, loser or finishing position, so qualifying stages, consolations and new formats compose freely.
- **Participants, entries and seeding.** Individuals, pairs and teams; entry status, alternates and lucky losers;
  policy-driven seeding and avoidance. Position and matchUp action queries return exactly the operations a draw's
  state allows.
- **Team competition.** Dual matches described as a tie format of collections, with line-ups and team scoring.
- **Scheduling.** Automated multi-day scheduling that respects recovery times and daily limits, grid scheduling with
  conflict detection, venues, courts and availability, and practice courts.
- **Scoring.** Point-by-point scoring with undo and redo, set and game entry, and outcome determination.
- **Publishing.** Visibility at every level, with time-based embargoes in an explicit time zone.
- **Rankings and ratings.** Ranking points from results under configurable policies, multi-tournament aggregation,
  and dynamic ratings.
- **Officiating and sanctioning.** Official assignments and eligibility, and sanctioning workflows checked against
  policy.
- **Mock data.** `mocksEngine` builds complete, valid tournament records from a compact profile with seeded
  randomness.

## Support for 7.x

`tods-competition-factory` 7.x is not maintained after `competition-factory` 8.0.0 is published: no further 7.x
releases, fixes or security patches. Every published 7.x version stays installable, and nothing is republished under
this name. The old name is not repointed to 8.x.

## Migrating

Migrate in two steps. The first runs on this release, where every route that 8.0.0 removes still works.

1. **Clear the deprecations on this release.** Upgrade to this version of `tods-competition-factory` and resolve:
   - every `@deprecated` tag your editor or type checker shows on a factory symbol; each message names the
     replacement or links the guide;
   - every runtime deprecation warning the factory emits: a named catalogue input (a `tieFormatName`, a ratings
     preset name) warns once per process, under Node as a `DeprecationWarning` with the code
     `FACTORY_CATALOGUE_NAME`, elsewhere with `console.warn`;
   - the other changes the [migration guide](https://courthive.github.io/competition-factory/docs/migration-8.0.0)
     lists, including the [table by governor](https://courthive.github.io/competition-factory/docs/migration-8.0.0#by-governor)
     of every method that moves to `tools` or `availability`, is renamed or is removed.
2. **Change the package** once 8.0.0 is published. Replace the dependency and the package name in your imports:

   ```sh
   npm uninstall tods-competition-factory
   npm install competition-factory
   ```

   ```js
   // before
   import { tournamentEngine, tools } from 'tods-competition-factory';
   // after
   import { tournamentEngine, tools } from 'competition-factory';
   ```

   Then work through the guide's 8.0.0 changes that have no 7.x equivalent.

## Installing this release

```sh
npm install tods-competition-factory
```

```js
import { mocksEngine, tournamentEngine } from 'tods-competition-factory';

const { tournamentRecord } = mocksEngine.generateTournamentRecord({
  drawProfiles: [{ drawSize: 32, drawType: 'FEED_IN_CHAMPIONSHIP' }],
});
tournamentEngine.setState(tournamentRecord);
```

## License

[MIT](https://github.com/CourtHive/competition-factory/blob/master/LICENSE)
