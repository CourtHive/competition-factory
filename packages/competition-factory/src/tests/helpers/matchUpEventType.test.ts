import { isMatchUpEventType } from '@Helpers/matchUpEventTypes/isMatchUpEventType';
import { expect, test } from 'vitest';

// constants
import { TEAM, SINGLES, DOUBLES } from '@Constants/matchUpTypes';

const scenarios = [
  {
    matchUpEventType: TEAM,
    matchUpType: TEAM,
    expected: true,
  },
  {
    matchUpEventType: SINGLES,
    matchUpType: TEAM,
    expected: false,
  },
  {
    matchUpEventType: TEAM,
    matchUpType: SINGLES,
    expected: false,
  },
  {
    matchUpEventType: SINGLES,
    matchUpType: SINGLES,
    expected: true,
  },
  {
    matchUpEventType: DOUBLES,
    matchUpType: DOUBLES,
    expected: true,
  },
];
test.each(scenarios)('meatchUpEventType works as expected', (scenario) => {
  const isType = isMatchUpEventType(scenario.matchUpEventType)(scenario.matchUpType);
  expect(isType).toEqual(scenario.expected);
});
