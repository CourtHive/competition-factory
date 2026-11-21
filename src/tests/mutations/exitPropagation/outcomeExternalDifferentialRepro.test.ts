import { canonicalHash } from '@Tests/testHarness/corpus/hash';
import tournamentEngine from '@Engines/syncEngine';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

// constants
import { DRAW_POSITION_ASSIGNED } from '@Constants/errorConditionConstants';

const cases = [
  ['Laver Cup', 'F-005-input.json'],
  ['feed-in championship', 'F-005-fic-input.json'],
] as const;

it.each(cases)('refuses a retired %s dual without writing the record', (_label, fixture) => {
  const url = new URL(`./fixtures/${fixture}`, import.meta.url);
  const scenario = JSON.parse(readFileSync(url, 'utf8'));
  expect(tournamentEngine.setState(scenario.initial.record).success).toBe(true);
  const hash = () => canonicalHash(tournamentEngine.getTournament().tournamentRecord);
  expect(hash()).toBe(scenario.initial.hash);

  const result = tournamentEngine.executionQueue([scenario.steps[0].directive], false);
  expect(result.error?.code).toBe(DRAW_POSITION_ASSIGNED.code);
  expect(hash()).toBe(scenario.initial.hash);
});
