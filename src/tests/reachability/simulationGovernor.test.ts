import { describe, expect, test } from 'vitest';

import * as governors from '@Assemblies/governors';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';

// constants
import { COMPLETED } from '@Constants/matchUpStatusConstants';

/**
 * The simulation governor holds the methods that play a draw out or set one up. They were mocks-governor
 * methods, which read as test tooling although TMX drives `completeDrawMatchUps` from its draw control bar
 * through `executionQueue`. The move changes their governor, not their engine name, and the mocks governor
 * keeps the old names (deprecated) until 8.0.0, so this suite pins both: the new home, the old aliases,
 * and that the engine call a client sends still works.
 */
const MOVED = ['completeDrawMatchUps', 'generateOutcome', 'generateOutcomeFromScoreString'];

describe('simulationGovernor', () => {
  test('the moved methods are on the simulation governor and still on the mocks governor', () => {
    for (const method of MOVED) {
      expect(typeof governors.simulationGovernor[method]).toEqual('function');
      // the deprecated alias is the same function, so the two can never drift
      expect(governors.mocksGovernor[method]).toBe(governors.simulationGovernor[method]);
    }
  });

  test('completeDrawMatchUps completes a draw through the engine by drawId', () => {
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 8 }], setState: true });

    let result: any = tournamentEngine.completeDrawMatchUps({ drawId, completeAllMatchUps: true });
    expect(result.success).toEqual(true);
    expect(result.completedCount).toEqual(7);

    result = tournamentEngine.allDrawMatchUps({ drawId });
    expect(result.matchUps.every(({ matchUpStatus }) => matchUpStatus === COMPLETED)).toEqual(true);
  });

  test('the outcome generators are reachable on the engine', () => {
    let result: any = tournamentEngine.generateOutcomeFromScoreString({ scoreString: '6-3 6-4', winningSide: 1 });
    expect(result.outcome.winningSide).toEqual(1);
    expect(result.outcome.score.scoreStringSide1).toEqual('6-3 6-4');

    result = tournamentEngine.generateOutcome({ matchUpFormat: 'SET3-S:6/TB7', winningSide: 2 });
    expect(result.outcome.winningSide).toEqual(2);
  });
});
