import { describe, expect, test } from 'vitest';

import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import * as governors from '@Assemblies/governors';

import POLICY_SEEDING_ITF from '@Fixtures/policies/POLICY_SEEDING_ITF';

/**
 * Two reachability gaps, found by a documentation-import sweep rather than by any test.
 *
 * `sanctioningGovernor` was written, tested and never registered in `governors/index.ts` — the same
 * omission that left the whole LADDER lifecycle unreachable in #4787. Thirty-five sanctioning
 * methods existed on no engine, so the governor page documented an API nobody could call.
 *
 * `isValidSeedPosition` answers "may this seed be placed at this drawPosition". It is what
 * `positionAssignment` consults before rejecting a hand placement, and what `positionActions` uses
 * to decide whether SEED_VALUE and REMOVE_SEED are offered. A client doing manual seed placement
 * needs the same answer, and had to re-derive seed blocks to get it.
 *
 * Every other suite for both reaches its functions by MODULE PATH, which proves the logic and not
 * the reach. This one goes exclusively through the engine and the governors index, so it fails
 * where those stay green.
 */
describe('seed-position validity is reachable through the engine', () => {
  function draw32() {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 32, participantsCount: 32, seedsCount: 8 }],
      setState: true,
    });
    const { drawId } = tournamentRecord.events[0].drawDefinitions[0];
    const result: any = tournamentEngine.getEvent({ drawId });
    const drawDefinition = result.drawDefinition;
    return { drawDefinition, structureId: drawDefinition.structures[0].structureId };
  }

  test('is present on the engine surface', () => {
    expect(typeof tournamentEngine.isValidSeedPosition).toEqual('function');
  });

  test('accepts any position when the policy ignores seed positions', () => {
    const { drawDefinition, structureId } = draw32();
    // POLICY_SEEDING_ITF carries validSeedPositions: { ignore: true } — hand placement anywhere.
    const valid = tournamentEngine.isValidSeedPosition({
      appliedPolicies: POLICY_SEEDING_ITF,
      drawPosition: 3,
      drawDefinition,
      structureId,
      seedNumber: 1,
    });
    expect(valid).toEqual(true);
  });

  test('the policy flag changes which positions are accepted', () => {
    const { drawDefinition, structureId } = draw32();
    const positions = [...Array(32).keys()].map((index) => index + 1);
    const accepted = (appliedPolicies: any) =>
      positions.filter((drawPosition) =>
        tournamentEngine.isValidSeedPosition({
          appliedPolicies,
          drawPosition,
          drawDefinition,
          structureId,
          seedNumber: 1,
        }),
      );

    // Asserting BOTH ends, so neither arm can pass vacuously: ignore accepts the whole draw, and
    // omitting the key restricts to seed-block positions.
    const ignoring = accepted(POLICY_SEEDING_ITF);
    expect(ignoring).toHaveLength(32);

    const enforced = accepted({ seeding: { ...POLICY_SEEDING_ITF.seeding, validSeedPositions: undefined } });
    expect(enforced.length).toBeGreaterThan(0);
    expect(enforced.length).toBeLessThan(32);
  });
});

describe('the sanctioning governor is reachable', () => {
  test('is registered in the governors index', () => {
    // It was not, for as long as it has existed.
    expect(governors.sanctioningGovernor).toBeDefined();
  });

  test('its methods are present on the engine surface', () => {
    const methods = [
      'createSanctioningRecord',
      'endorseApplication',
      'approveApplication',
      'getAvailableTransitions',
      'getCalendarConflicts',
      'getCompleteness',
    ];
    const missing = methods.filter((method) => typeof tournamentEngine[method] !== 'function');
    expect(missing).toEqual([]);
  });
});
