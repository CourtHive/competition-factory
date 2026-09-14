import { feedInChampionship } from '@Tests/mutations/drawDefinitions/primitives/feedIn';
import { expect, it } from 'vitest';

// constants
import { INVALID_DRAW_SIZE } from '@Constants/errorConditionConstants';
import { FICQF } from '@Constants/drawDefinitionConstants';

it('can generate FEED_IN_CHAMPIONSHIP to QF with drawSize 32', () => {
  const { links, mainDrawMatchUps, consolationMatchUps } = feedInChampionship({
    drawType: FICQF,
    drawSize: 32,
  });

  expect(mainDrawMatchUps.length).toEqual(31);
  expect(consolationMatchUps.length).toEqual(27);
  expect(links.length).toEqual(3);
});

it('can generate FEED_IN_CHAMPIONSHIP to QF with drawSize 16', () => {
  const { links, mainDrawMatchUps, consolationMatchUps } = feedInChampionship({
    drawType: FICQF,
    drawSize: 16,
  });

  expect(mainDrawMatchUps.length).toEqual(15);
  expect(consolationMatchUps.length).toEqual(11);
  expect(links.length).toEqual(2);
});

it('can generate FEED_IN_CHAMPIONSHIP to QF with drawSize 8', () => {
  const { links, mainDrawMatchUps, consolationMatchUps } = feedInChampionship({
    drawType: FICQF,
    drawSize: 8,
  });

  expect(mainDrawMatchUps.length).toEqual(7);
  expect(links.length).toEqual(1);
  expect(consolationMatchUps.length).toEqual(3);
});

it('can generate FEED_IN_CHAMPIONSHIP to QF with drawSize 4', () => {
  const { links, mainDrawMatchUps, consolationMatchUps } = feedInChampionship({
    drawType: FICQF,
    drawSize: 4,
  });

  expect(mainDrawMatchUps.length).toEqual(3);
  expect(links.length).toEqual(1);
  expect(consolationMatchUps.length).toEqual(1);
});

it('can generate FEED_IN_CHAMPIONSHIP to QF with drawSize 2', () => {
  const result = feedInChampionship({
    drawTypeCoercion: false,
    drawType: FICQF,
    drawSize: 2,
  });

  expect(result.error).toEqual(INVALID_DRAW_SIZE);
});
