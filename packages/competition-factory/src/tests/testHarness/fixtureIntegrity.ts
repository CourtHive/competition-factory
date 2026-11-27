import { afterAll, beforeAll } from 'vitest';

/**
 * Published fixtures stay as published: a test file that changes `fixtures.tieFormats`, `fixtures.competitionFormats`
 * or `fixtures.policies` fails, naming what changed.
 *
 * A fixture is module state. On a run with `isolate: false` (vitest.config.mts) a worker keeps its modules across
 * files, so a write to a fixture object reaches every later file in that worker, and the file that fails is one that
 * reads the fixture, not the one that wrote it. This check fails the writer. It covers a write made by the test and a
 * write made by engine code the test handed the fixture to: a caller's object is the caller's, and the engine copies
 * before it changes one.
 *
 * The fixtures are read in `beforeAll`, after the test file is imported, so a module mock the file registers still
 * applies (see queryPurity.ts).
 */
type Watched = Record<string, Record<string, unknown>>;

const watch = async (): Promise<Watched> => {
  const { fixtures } = await import('@Fixtures/index');
  return {
    competitionFormats: fixtures.competitionFormats,
    tieFormats: fixtures.tieFormats,
    policies: fixtures.policies,
  };
};

const serialize = (watched: Watched) =>
  Object.fromEntries(
    Object.entries(watched).flatMap(([group, entries]) =>
      Object.entries(entries).map(([name, value]) => [`${group}.${name}`, JSON.stringify(value)]),
    ),
  );

let before: Record<string, string> = {};

beforeAll(async () => {
  before = serialize(await watch());
});

afterAll(async () => {
  const after = serialize(await watch());
  const changed = Object.keys({ ...before, ...after }).filter((key) => before[key] !== after[key]);
  if (changed.length) throw new Error(`this file changed published fixtures: ${changed.join(', ')}`);
});
