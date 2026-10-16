import { compareTieFormats } from '@Query/hierarchical/tieFormats/compareTieFormats';
import tieFormatDefaults from '@Assemblies/generators/templates/tieFormatDefaults';
import { it, expect, test } from 'vitest';

// constants and types
import { COLLEGE_D3, COLLEGE_DEFAULT, COLLEGE_JUCO, DOMINANT_DUO } from '@Constants/tieFormatConstants';
import collegeDefault from '@Fixtures/scoring/tieFormats/COLLEGE_DEFAULT.json';
import collegeJuco from '@Fixtures/scoring/tieFormats/COLLEGE_JUCO.json';
import collegeD3 from '@Fixtures/scoring/tieFormats/COLLEGE_D3.json';
import { DOUBLES, SINGLES } from '@Constants/matchUpTypes';
import { TieFormat } from '@Types/tournamentTypes';

it('can find differences in tieFormats', () => {
  const descendant = tieFormatDefaults({ namedFormat: COLLEGE_DEFAULT });
  const ancestor = tieFormatDefaults({ namedFormat: COLLEGE_D3 });

  const result = compareTieFormats({ ancestor, descendant });
  expect(result.matchUpFormatDifferences).toEqual(['SET1-S:6/TB7', 'SET1-S:8/TB7@7']);
  expect(result.different).toEqual(true);
});

test('all JSON and tieFormatNames for college formats are equivalent', () => {
  let result = compareTieFormats({
    ancestor: tieFormatDefaults({ namedFormat: COLLEGE_DEFAULT }),
    descendant: collegeDefault,
  });
  expect(result.matchUpFormatDifferences).toEqual([]);
  result = compareTieFormats({
    ancestor: tieFormatDefaults({ namedFormat: COLLEGE_JUCO }),
    descendant: collegeJuco,
  });
  expect(result.matchUpFormatDifferences).toEqual([]);
  result = compareTieFormats({
    ancestor: tieFormatDefaults({ namedFormat: COLLEGE_D3 }),
    descendant: collegeD3,
  });
  expect(result.matchUpFormatDifferences).toEqual([]);
});

it('can differentiate matchUpValue', () => {
  const example = {
    modifiedTieFormat: {
      collectionDefinitions: [
        {
          collectionId: 'collectionId001',
          matchUpFormat: 'SET1-S:8/TB7',
          collectionName: 'Doubles',
          matchUpType: DOUBLES,
          collectionOrder: 1,
          matchUpCount: 1,
          matchUpValue: 0,
        },
        {
          matchUpFormat: 'SET3-S:6/TB7-F:TB10',
          collectionId: 'collectionId002',
          collectionName: 'Singles',
          matchUpType: SINGLES,
          collectionOrder: 2,
          matchUpCount: 2,
          matchUpValue: 0,
        },
      ],
      tieFormatName: DOMINANT_DUO,
      winCriteria: {
        aggregateValue: true,
      },
    },
    ancestor: {
      collectionDefinitions: [
        {
          collectionId: 'collectionId001',
          matchUpFormat: 'SET1-S:8/TB7',
          collectionName: 'Doubles',
          matchUpType: DOUBLES,
          collectionOrder: 1,
          matchUpCount: 1,
          matchUpValue: 1,
        },
        {
          matchUpFormat: 'SET3-S:6/TB7-F:TB10',
          collectionId: 'collectionId002',
          collectionName: 'Singles',
          matchUpType: SINGLES,
          collectionOrder: 2,
          matchUpCount: 2,
          matchUpValue: 1,
        },
      ],
      tieFormatName: DOMINANT_DUO,
      winCriteria: {
        valueGoal: 2,
      },
    },
  };

  const ancestor = example.ancestor as TieFormat;
  const descendant = example.modifiedTieFormat as TieFormat;
  const result = compareTieFormats({ ancestor, descendant });
  expect(Math.abs(result.valueDifference)).toEqual(3);
  expect(result.different).toEqual(true);
});
