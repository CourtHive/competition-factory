import * as matchUpFormatCode from '@Assemblies/governors/matchUpFormatGovernor';
import { expect, it } from 'vitest';

// constants
import { RALLY } from '@Constants/matchUpFormatConstants';

it('supports annotations for PickleBall', () => {
  let format = 'SET3-S:TB15';
  let result = matchUpFormatCode.stringify(matchUpFormatCode.parse(format));
  expect(format).toEqual(result);

  format = 'SET3-S:TB15NOAD';
  result = matchUpFormatCode.stringify(matchUpFormatCode.parse(format));
  expect(format).toEqual(result);

  format = 'SET3-S:TB21@RALLY';
  let parsed = matchUpFormatCode.parse(format);
  expect(parsed).toEqual({
    setFormat: { tiebreakSet: { tiebreakTo: 21, modifier: RALLY } },
    bestOf: 3,
  });

  let stringified = matchUpFormatCode.stringify(parsed);
  expect(stringified).toEqual(format);

  format = 'SET3-S:TB21NOAD@RALLY';
  parsed = matchUpFormatCode.parse(format);
  expect(parsed).toEqual({
    setFormat: {
      tiebreakSet: { tiebreakTo: 21, modifier: RALLY, NoAD: true },
    },
    bestOf: 3,
  });
  stringified = matchUpFormatCode.stringify(parsed);
  expect(stringified).toEqual(format);
});

it('canary: SET3-S:TB21NOAD@RALLY round-trip unchanged after multi-root refactor', () => {
  const format = 'SET3-S:TB21NOAD@RALLY';
  const parsed = matchUpFormatCode.parse(format);
  expect(parsed).toEqual({
    setFormat: {
      tiebreakSet: { tiebreakTo: 21, modifier: RALLY, NoAD: true },
    },
    bestOf: 3,
  });
  const stringified = matchUpFormatCode.stringify(parsed);
  expect(stringified).toEqual(format);
  expect(matchUpFormatCode.isValidMatchUpFormat({ matchUpFormat: format })).toEqual(true);
});
