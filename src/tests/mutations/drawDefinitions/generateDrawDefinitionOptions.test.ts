import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it, test } from 'vitest';

// constants and fixtures
import POLICY_DRAWS_DEFAULT from '@Fixtures/policies/POLICY_DRAWS_DEFAULT';
import { INVALID_DRAW_SIZE } from '@Constants/errorConditionConstants';
import { POLICY_TYPE_DRAWS } from '@Constants/policyConstants';
import {
  AD_HOC,
  CURTIS_CONSOLATION,
  ROUND_ROBIN_WITH_PLAYOFF,
  SINGLE_ELIMINATION,
} from '@Constants/drawDefinitionConstants';

it('can be configured to not enforce minimum drawSize for multi-structure draws', () => {
  const result = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 2, drawType: CURTIS_CONSOLATION, drawTypeCoercion: false }],
  });

  expect(result.error).toEqual(INVALID_DRAW_SIZE);

  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        enforceMinimumDrawSize: false,
        drawType: CURTIS_CONSOLATION,
        drawTypeCoercion: false,
        drawSize: 2,
      },
    ],
  });

  expect(drawId).not.toBeUndefined();

  tournamentEngine.setState(tournamentRecord);

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  expect(drawDefinition.structures.length).toEqual(1);
  expect(drawDefinition.drawType).toEqual(CURTIS_CONSOLATION);
});

const scenarios: any[] = [
  {
    expectation: { drawType: AD_HOC, success: true },
    drawProfile: { drawType: AD_HOC, drawSize: 2 },
    drawTypeCoercion: { AD_HOC: false },
  },
  {
    drawTypeCoercion: { AD_HOC: true, success: true },
    drawProfile: { drawType: AD_HOC, drawSize: 2 },
    expectation: { drawType: SINGLE_ELIMINATION },
  },
  {
    expectation: { drawType: ROUND_ROBIN_WITH_PLAYOFF, success: true },
    drawProfile: { drawType: ROUND_ROBIN_WITH_PLAYOFF, drawSize: 4 },
    drawTypeCoercion: { ROUND_ROBIN_WITH_PLAYOFF: false },
  },
  {
    drawProfile: { drawType: ROUND_ROBIN_WITH_PLAYOFF, drawSize: 3 },
    drawTypeCoercion: { ROUND_ROBIN_WITH_PLAYOFF: false },
    expectation: { error: INVALID_DRAW_SIZE },
  },
  {
    drawProfile: { drawType: ROUND_ROBIN_WITH_PLAYOFF, drawSize: 4 },
    expectation: { drawType: SINGLE_ELIMINATION, success: true },
    drawTypeCoercion: { ROUND_ROBIN_WITH_PLAYOFF: 5 },
  },
];

test.each(scenarios)('drawTypeCoercion can be configured to coerce all drawTypes', (scenario) => {
  const result = mocksEngine.generateTournamentRecord({
    policyDefinitions: { [POLICY_TYPE_DRAWS]: { drawTypeCoercion: scenario.drawTypeCoercion } },
    drawProfiles: [{ ...scenario.drawProfile, drawId: 'drawId' }],
    setState: true,
  });
  if (scenario.expectation.success) {
    expect(result.success).toEqual(true);
    const { drawDefinition } = tournamentEngine.getEvent({ drawId: 'drawId' });
    expect(drawDefinition.drawType).toEqual(scenario.expectation.drawType);
  } else if (scenario.expectation.error) {
    expect(result.error).toEqual(scenario.expectation.error);
  }
});

test('drawTypeCoercion can be configured via Draws Policy', () => {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: AD_HOC, drawSize: 2, drawId: 'drawId' }],
    policyDefinitions: POLICY_DRAWS_DEFAULT,
    setState: true,
  });
  const { drawDefinition } = tournamentEngine.getEvent({ drawId: 'drawId' });
  expect(drawDefinition.drawType).toEqual(AD_HOC);
});
