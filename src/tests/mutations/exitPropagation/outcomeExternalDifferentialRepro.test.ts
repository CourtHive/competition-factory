import { replayThroughEngine } from '@Tests/testHarness/corpus/replayScenario';
import { canonicalHash } from '@Tests/testHarness/corpus/hash';
import tournamentEngine from '@Engines/syncEngine';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const cases = [
  ['Laver Cup', 'F-005-input.json'],
  ['feed-in championship', 'F-005-fic-input.json'],
] as const;

it.skipIf(process.env.OUTCOME_EXTERNAL_DIFF_REPRO !== '1').each(cases)(
  'refuses a retired %s dual without writing the record',
  (_label, fixture) => {
    const scenario = JSON.parse(readFileSync(`ext-report/findings/${fixture}`, 'utf8'));
    // The harvested hash describes the partial write. Grade the refusal against the contract.
    scenario.steps[0].hash = scenario.initial.hash;
    let exception: string | undefined;
    let mismatches: ReturnType<typeof replayThroughEngine> = [];
    try {
      mismatches = replayThroughEngine(scenario);
    } catch (error) {
      exception = error instanceof Error ? error.message : String(error);
    }
    const hash = canonicalHash(tournamentEngine.getTournament().tournamentRecord);
    expect({ exception, mismatches, hash }).toEqual({
      exception: undefined,
      mismatches: [],
      hash: scenario.initial.hash,
    });
  },
);
