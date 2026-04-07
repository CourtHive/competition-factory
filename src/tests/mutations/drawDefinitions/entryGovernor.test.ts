import { addDrawEntries, addDrawEntry } from '@Mutate/drawDefinitions/entryGovernor/addDrawEntries';
import { newDrawDefinition } from '@Assemblies/generators/drawDefinitions/newDrawDefinition';
import { deleteNotices, getNotices, setSubscriptions } from '@Global/state/globalState';
import { removeEntry } from '@Mutate/drawDefinitions/entryGovernor/removeEntry';
import { expect, it } from 'vitest';

// constants
import { MAIN, QUALIFYING } from '@Constants/drawDefinitionConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { DrawDefinition } from '@Types/tournamentTypes';
import { DATA_ISSUE } from '@Constants/topicConstants';
import { DUPLICATE_ENTRY } from '@Constants/errorConditionConstants';

let result;

it('allows adding participants to valid stages without structures (unconstrained)', () => {
  const drawDefinition: DrawDefinition = newDrawDefinition({
    drawId: 'uuid-abc',
  });
  result = addDrawEntry({
    entryStage: QUALIFYING,
    participantId: '123',
    drawDefinition,
  });
  // QUALIFYING is a valid stage — unsanctioned draws are unconstrained
  expect(result).toMatchObject(SUCCESS);
});

it('will not allow duplicate entries', () => {
  setSubscriptions({ subscriptions: { [DATA_ISSUE]: () => {} } });
  const drawDefinition: DrawDefinition = newDrawDefinition({
    drawId: 'uuid-abc',
  });

  result = addDrawEntry({
    participantId: 'uuid1',
    entryStage: QUALIFYING,
    drawDefinition,
  });
  expect(result).toMatchObject(SUCCESS);
  result = getNotices({ topic: DATA_ISSUE });
  expect(result).toMatchObject([]);

  result = addDrawEntry({
    suppressDuplicateEntries: false,
    participantId: 'uuid1',
    entryStage: QUALIFYING,
    drawDefinition,
  });
  expect(result).toMatchObject({ error: DUPLICATE_ENTRY });
  result = getNotices({ topic: DATA_ISSUE });
  expect(result).toMatchObject([]);

  result = addDrawEntry({
    participantId: 'uuid1',
    entryStage: QUALIFYING,
    drawDefinition,
  });
  expect(result).toMatchObject(SUCCESS);
  result = getNotices({ topic: DATA_ISSUE });
  expect(result.length).toEqual(1);
  deleteNotices();
});

it('will not allow duplicate entries', () => {
  setSubscriptions({ subscriptions: { [DATA_ISSUE]: () => {} } });
  const drawDefinition: DrawDefinition = newDrawDefinition({
    drawId: 'uuid-abc',
  });

  result = addDrawEntry({
    participantId: 'uuid1',
    entryStage: MAIN,
    drawDefinition,
  });
  expect(result).toMatchObject(SUCCESS);
  result = getNotices({ topic: DATA_ISSUE });
  expect(result.length).toEqual(0);

  result = addDrawEntry({
    suppressDuplicateEntries: false,
    participantId: 'uuid1',
    entryStage: MAIN,
    drawDefinition,
  });
  expect(result).toMatchObject({ error: DUPLICATE_ENTRY });
  result = getNotices({ topic: DATA_ISSUE });
  expect(result.length).toEqual(0);

  // now test to ensure participant cannot be added to two stages

  result = addDrawEntry({
    suppressDuplicateEntries: false,
    participantId: 'uuid1',
    entryStage: QUALIFYING,
    drawDefinition,
  });
  expect(result).toMatchObject({ error: DUPLICATE_ENTRY });
  result = getNotices({ topic: DATA_ISSUE });
  expect(result.length).toEqual(0);


  result = addDrawEntry({
    participantId: 'uuid1',
    entryStage: QUALIFYING,
    drawDefinition,
  });
  expect(result).toMatchObject(SUCCESS);
  result = getNotices({ topic: DATA_ISSUE });
  expect(result.length).toEqual(1);

  deleteNotices();
});

it('adds participants to stages without structures (unconstrained)', () => {
  const drawDefinition: DrawDefinition = newDrawDefinition({
    drawId: 'uuid-abc',
  });
  let result: any = addDrawEntry({
    participantId: 'uuid0',
    entryStage: QUALIFYING,
    drawDefinition,
  });
  expect(result).toMatchObject(SUCCESS);

  result = addDrawEntry({
    participantId: 'uuid2',
    entryStage: QUALIFYING,
    drawDefinition,
  });
  expect(result).toMatchObject(SUCCESS);
  result = addDrawEntry({
    participantId: 'uuid3',
    entryStage: QUALIFYING,
    drawDefinition,
  });
  expect(result).toMatchObject(SUCCESS);
  result = addDrawEntry({
    participantId: 'uuid4',
    entryStage: QUALIFYING,
    drawDefinition,
  });
  expect(result).toMatchObject(SUCCESS);
  result = addDrawEntry({
    participantId: 'uuid5',
    entryStage: QUALIFYING,
    drawDefinition,
  });
  expect(result).toMatchObject(SUCCESS);

  result = addDrawEntry({
    participantId: 'uuid6',
    entryStage: MAIN,
    drawDefinition,
  });
  expect(result).toMatchObject(SUCCESS);
  result = addDrawEntry({
    participantId: 'uuid7',
    entryStage: MAIN,
    drawDefinition,
  });
  expect(result).toMatchObject(SUCCESS);
  // Without structures, there are no draw size limits to enforce
  result = addDrawEntry({
    participantId: 'uuid8',
    entryStage: MAIN,
    drawDefinition,
  });
  expect(result).toMatchObject(SUCCESS);

  result = removeEntry({ drawDefinition, participantId: 'uuid8' });
  expect(result.success).toEqual(true);
});

it('can add bulk entries', () => {
  const drawDefinition = newDrawDefinition({ drawId: 'uuid-abc' });
  const participants = [
    { participantId: 'uuid1' },
    { participantId: 'uuid2' },
    { participantId: 'uuid3' },
    { participantId: 'uuid4' },
    { participantId: 'uuid5' },
    { participantId: 'uuid6' },
    { participantId: 'uuid7' },
    { participantId: 'uuid8' },
  ];
  const participantIds = participants.map((p) => p.participantId);
  result = addDrawEntries({ drawDefinition, participantIds, stage: MAIN });
  expect(result).toMatchObject(SUCCESS);
});

it('allows bulk entries without structures (unconstrained)', () => {
  const drawDefinition = newDrawDefinition({ drawId: 'uuid-abc' });
  let result: any;
  const participants = [
    { participantId: 'uuid1' },
    { participantId: 'uuid2' },
    { participantId: 'uuid3' },
    { participantId: 'uuid4' },
    { participantId: 'uuid5' },
    { participantId: 'uuid6' },
    { participantId: 'uuid7' },
    { participantId: 'uuid8' },
  ];
  const participantIds = participants.map((p) => p.participantId);
  // Without structures, draws are unconstrained — no draw size limit
  result = addDrawEntries({ drawDefinition, participantIds, stage: MAIN });
  expect(result.success).toEqual(true);
});
