import * as simulationGovernor from '@Assemblies/governors/simulationGovernor';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it, describe } from 'vitest';

const SIMULATION_METHODS = Object.keys(simulationGovernor).filter(
  (key) => typeof simulationGovernor[key] === 'function',
);

describe('mocksEngine mounts simulationGovernor', () => {
  // applyOutcomes exists only on simulationGovernor, so this fails if the mount is dropped; the other three
  // currently also resolve through the mocksGovernor aliases that 8.0.0 removes
  it.each(SIMULATION_METHODS)('exposes %s', (method) => {
    expect(typeof mocksEngine[method]).toEqual('function');
  });

  it('includes the three methods the mocksGovernor aliases carried', () => {
    expect(SIMULATION_METHODS).toEqual(
      expect.arrayContaining([
        'generateOutcome',
        'generateOutcomeFromScoreString',
        'completeDrawMatchUps',
        'applyOutcomes',
      ]),
    );
  });

  it('applies the nonRandom seed, which a bare governor call ignores', () => {
    const params = { matchUpFormat: 'SET3-S:6/TB7', nonRandom: 7 };
    const first = mocksEngine.generateOutcome({ ...params });
    const second = mocksEngine.generateOutcome({ ...params });
    expect(first.outcome).toBeDefined();
    expect(second.outcome).toEqual(first.outcome);
  });

  it('generates an outcome from a score string', () => {
    const { outcome } = mocksEngine.generateOutcomeFromScoreString({ scoreString: '6-1 6-1', winningSide: 1 });
    expect(outcome.winningSide).toEqual(1);
    expect(outcome.score.scoreStringSide1).toEqual('6-1 6-1');
  });
});
