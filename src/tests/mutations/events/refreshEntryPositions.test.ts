import { refreshEntryPositions } from '@Mutate/entries/refreshEntryPositions';
import { expect, it } from 'vitest';

// constants
import { CONSOLATION, MAIN, QUALIFYING } from '@Constants/drawDefinitionConstants';

it('can add and update entryPositions', () => {
  const entries = [{}, {}, {}, {}, {}, {}];
  let positionedEntries = refreshEntryPositions({ entries });
  expect(positionedEntries).toEqual([
    { entryPosition: 1 },
    { entryPosition: 2 },
    { entryPosition: 3 },
    { entryPosition: 4 },
    { entryPosition: 5 },
    { entryPosition: 6 },
  ]);
  positionedEntries.splice(2, 2);
  positionedEntries = refreshEntryPositions({ entries: positionedEntries });
  expect(positionedEntries).toEqual([
    { entryPosition: 1 },
    { entryPosition: 2 },
    { entryPosition: 3 },
    { entryPosition: 4 },
  ]);
  positionedEntries.push(...[{}, {}, {}]);
  positionedEntries = refreshEntryPositions({ entries: positionedEntries });
  expect(positionedEntries).toEqual([
    { entryPosition: 1 },
    { entryPosition: 2 },
    { entryPosition: 3 },
    { entryPosition: 4 },
    { entryPosition: 5 },
    { entryPosition: 6 },
    { entryPosition: 7 },
  ]);
});

it('can separate bye stage, add, and update entryPositions', () => {
  const entries = [
    { entryStage: MAIN },
    { entryStage: CONSOLATION },
    { entryStage: QUALIFYING },
    { entryStage: MAIN },
    { entryStage: QUALIFYING },
    { entryStage: MAIN },
    { entryStage: CONSOLATION },
  ];
  const positionedEntries = refreshEntryPositions({ entries });
  expect(positionedEntries).toEqual([
    { entryStage: 'MAIN', entryPosition: 1 },
    { entryStage: 'MAIN', entryPosition: 2 },
    { entryStage: 'MAIN', entryPosition: 3 },
    { entryStage: 'CONSOLATION', entryPosition: 1 },
    { entryStage: 'CONSOLATION', entryPosition: 2 },
    { entryStage: 'QUALIFYING', entryPosition: 1 },
    { entryStage: 'QUALIFYING', entryPosition: 2 },
  ]);
});

it('can handle missing positions', () => {
  const entries = [
    { entryStage: MAIN, entryPosition: 3 },
    { entryStage: CONSOLATION, entryPosition: 7 },
    { entryStage: QUALIFYING },
    { entryStage: MAIN },
    { entryStage: QUALIFYING, entryPosition: 9 },
    { entryStage: MAIN },
    { entryStage: CONSOLATION },
  ];
  const positionedEntries = refreshEntryPositions({ entries });
  expect(positionedEntries).toEqual([
    { entryStage: 'MAIN', entryPosition: 1 },
    { entryStage: 'MAIN', entryPosition: 2 },
    { entryStage: 'MAIN', entryPosition: 3 },
    { entryStage: 'CONSOLATION', entryPosition: 1 },
    { entryStage: 'CONSOLATION', entryPosition: 2 },
    { entryStage: 'QUALIFYING', entryPosition: 1 },
    { entryStage: 'QUALIFYING', entryPosition: 2 },
  ]);
});
