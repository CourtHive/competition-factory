---
title: Installation
---

## Requirements

- **Node.js 24 or later** for server-side and build-time use (`engines.node` is `>=24`).
- No runtime dependencies: installing the factory adds one package.
- TypeScript declarations ship with the package; there is no `@types` package to add.

## Add to a project

```sh
pnpm add tods-competition-factory
# - or -
yarn add tods-competition-factory
# - or -
npm i tods-competition-factory
```

## Include in a project

The package ships both an ES module build and a CommonJS build, and the right one is chosen from how it is loaded.

```js
// ES modules
import { tournamentEngine, mocksEngine, tools } from 'tods-competition-factory';

// CommonJS
const { tournamentEngine, mocksEngine, tools } = require('tods-competition-factory');
```

Named imports are preferred over `import * as factory`: the package declares no side effects, so a bundler keeps only
what is imported.

### Entry points

| Import                                                   | What it provides                                                                   |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `tods-competition-factory`                               | Engines, governors, `tools`, fixtures, constants, enums and types                  |
| `tods-competition-factory/constants`                     | Named constants only, without loading engines, global state or fixtures            |
| `tods-competition-factory/governors`                     | The governors alone, for assembling a [custom engine](./engines/custom-engines.md) |
| `tods-competition-factory/score-entry-state`             | A headless [score-entry state engine](./scoring-engine/score-entry-state.md)       |
| `tods-competition-factory/schema/tournament.schema.json` | The JSON Schema of a tournament record                                             |

For a constants-only consumer, use the dedicated subpath (ESM and CommonJS with their own declarations):

```ts
import { matchUpStatusConstants, entryStatusConstants } from 'tods-competition-factory/constants';
```

It exports the same named constants as the root constants namespace. Existing root imports and `factoryConstants`
remain available. Policies and scoring-format fixtures are separate and are not part of this subpath.

```js
import { scoreGovernor, drawsGovernor } from 'tods-competition-factory/governors';
```

Only these entry points are supported. Paths inside `dist/` are not part of the package's interface.

## Check the installation

```js
import { askEngine } from 'tods-competition-factory';

askEngine.version(); // the installed version, e.g. '7.40.0'
```

## A first tournament

The [mocks engine](./testing/mocks-engine-getting-started.md) generates a complete tournament record, which an engine
then holds as its state:

```js
import { mocksEngine, tournamentEngine } from 'tods-competition-factory';

const { tournamentRecord } = mocksEngine.generateTournamentRecord({
  drawProfiles: [{ drawSize: 8 }],
});

tournamentEngine.setState(tournamentRecord);

const { matchUps } = tournamentEngine.allTournamentMatchUps();
console.log(matchUps.length); // 7
```

## Where next

- [Mutation Engines](./engines/mutation-engines.md): which engine to use on a client and on a server.
- [Engine Methods](./engines/engine-methods.md): how methods are called and what they return.
- [Governors](./governors/governors-overview.md): the methods, grouped by what they act on.
- [Migration to 8.0.0](./migration-8.0.0.md): what to change now to be ready for the next major release.
