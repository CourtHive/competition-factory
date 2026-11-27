import { afterAll, beforeAll } from 'vitest';

/**
 * The catalogue stays as published: a test file that changes the catalogue's tie formats, competition formats,
 * policies or ratings presets fails, naming what changed. The same check as fixtureIntegrity.ts, for the objects the
 * catalogue package exports: a test reads them from there and hands them to the engine, and in a worker that keeps
 * its modules across files a write to one reaches every later file.
 */
const watch = async (): Promise<Record<string, Record<string, unknown>>> => {
  const catalogue = await import('@courthive/competition-catalogue');
  return {
    competitionFormats: catalogue.competitionFormats,
    ratingsPresets: catalogue.ratingsPresets,
    tieFormats: catalogue.tieFormats,
    policies: catalogue.policies,
  };
};

const serialize = (watched: Record<string, Record<string, unknown>>) =>
  Object.fromEntries(
    Object.entries(watched).flatMap(([group, entries]) =>
      Object.entries(entries ?? {}).map(([name, value]) => [`${group}.${name}`, JSON.stringify(value)]),
    ),
  );

let before: Record<string, string> = {};

beforeAll(async () => {
  before = serialize(await watch());
});

afterAll(async () => {
  const after = serialize(await watch());
  const changed = Object.keys({ ...before, ...after }).filter((key) => before[key] !== after[key]);
  if (changed.length) throw new Error(`this file changed the catalogue: ${changed.join(', ')}`);
});
