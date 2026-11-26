# tods-competition-factory continues as competition-factory

This is the final release of `tods-competition-factory`. The factory continues under a new package name,
[`competition-factory`](https://www.npmjs.com/package/competition-factory), starting at 8.0.0.

- **New package:** [`competition-factory`](https://www.npmjs.com/package/competition-factory)
- **Documentation:** <https://courthive.github.io/competition-factory/>
- **Migration guide:** [Migration to 8.0.0](https://courthive.github.io/competition-factory/docs/migration-8.0.0)
- **Source and issues:** <https://github.com/CourtHive/competition-factory>

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
2. **Change the package.** Replace the dependency and the package name in your imports:

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

## License

[MIT](./LICENSE)
