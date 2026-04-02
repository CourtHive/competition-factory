import { getSeedsCount } from '@Query/drawDefinition/getSeedsCount';
import { expect, it } from 'vitest';

import SEEDING_USTA from '@Fixtures/policies/POLICY_SEEDING_DEFAULT';
import { POLICY_TYPE_SEEDING } from '@Constants/policyConstants';
import { CLUSTER } from '@Constants/drawDefinitionConstants';
import {
  INVALID_POLICY_DEFINITION,
  INVALID_VALUES,
  MISSING_DRAW_SIZE,
  MISSING_PARTICIPANT_COUNT,
  MISSING_SEEDCOUNT_THRESHOLDS,
} from '@Constants/errorConditionConstants';

it('can accurately determine seedsCount from drawSize and participantsCount', () => {
  let seedsCount, error;
  // @ts-expect-error test
  ({ seedsCount } = getSeedsCount());
  expect(seedsCount).toEqual(undefined);

  ({ seedsCount, error } = getSeedsCount({ policyDefinitions: SEEDING_USTA }));
  expect(seedsCount).toEqual(undefined);
  expect(error).toEqual(MISSING_PARTICIPANT_COUNT);

  ({ error } = getSeedsCount({
    policyDefinitions: SEEDING_USTA,
    // @ts-expect-error test
    participantsCount: 'fifteen',
  }));
  expect(error).toEqual(INVALID_VALUES);

  ({ error } = getSeedsCount({
    requireParticipantCount: false,
    policyDefinitions: SEEDING_USTA,
  }));
  expect(error).toEqual(MISSING_DRAW_SIZE);

  ({ error } = getSeedsCount({
    policyDefinitions: {},
    participantsCount: 15,
  }));
  expect(error).toEqual(INVALID_POLICY_DEFINITION);

  let policyDefinitions: any = {
    [POLICY_TYPE_SEEDING]: {
      seedingProfile: { positioning: CLUSTER },
      duplicateSeedNumbers: true,
    },
  };

  ({ error } = getSeedsCount({
    policyDefinitions,
    participantsCount: 15,
  }));
  expect(error).toEqual(MISSING_SEEDCOUNT_THRESHOLDS);

  policyDefinitions = {
    [POLICY_TYPE_SEEDING]: {
      seedingProfile: { positioning: CLUSTER },
      duplicateSeedNumbers: true,
      seedsCountThresholds: [{ drawSize: 4, minimumParticipantCount: 3, seedsCount: 2 }],
    },
  };

  ({ seedsCount } = getSeedsCount({
    policyDefinitions,
    participantsCount: 15,
  }));
  // expect 0 because there is no drawSizeProgression and no appropriate threshold
  expect(seedsCount).toEqual(0);

  ({ seedsCount } = getSeedsCount({
    drawSizeProgression: true,
    policyDefinitions,
    participantsCount: 15,
  }));
  // expect 2 because { drawSizeProgression: true }
  expect(seedsCount).toEqual(2);

  ({ seedsCount } = getSeedsCount({
    policyDefinitions: SEEDING_USTA,
    participantsCount: 15,
  }));
  expect(seedsCount).toEqual(4);

  ({ seedsCount } = getSeedsCount({
    policyDefinitions: SEEDING_USTA,
    participantsCount: 15,
    drawSize: 16,
  }));
  expect(seedsCount).toEqual(4);

  ({ seedsCount } = getSeedsCount({
    policyDefinitions: SEEDING_USTA,
    participantsCount: 15,
    drawSize: 128,
  }));
  expect(seedsCount).toEqual(4);

  ({ seedsCount } = getSeedsCount({
    policyDefinitions: SEEDING_USTA,
    participantsCount: 64,
    drawSize: 128,
  }));
  expect(seedsCount).toEqual(16);

  ({ seedsCount } = getSeedsCount({
    policyDefinitions: SEEDING_USTA,
    participantsCount: 65,
    drawSize: 128,
  }));
  expect(seedsCount).toEqual(16);

  ({ seedsCount } = getSeedsCount({
    policyDefinitions: SEEDING_USTA,
    participantsCount: 97,
    drawSize: 128,
  }));
  expect(seedsCount).toEqual(32);

  ({ seedsCount } = getSeedsCount({
    policyDefinitions: SEEDING_USTA,
    drawSizeProgression: true,
    participantsCount: 16,
    drawSize: 128,
  }));
  expect(seedsCount).toEqual(4);
});
