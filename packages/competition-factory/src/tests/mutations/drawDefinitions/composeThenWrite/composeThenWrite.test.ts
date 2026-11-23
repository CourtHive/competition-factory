import { composeThenWrite, isStoredDraw } from '@Tools/composeThenWrite';
import { randomSource, setRandomSource } from '@Tools/prng';
import { afterEach, expect, test } from 'vitest';

afterEach(() => setRandomSource());

test('the write replays the draws the composition took, from the given random and the ambient source', () => {
  setRandomSource(7);
  let given = 0;
  const random = () => (given++ % 10) / 10;
  const composed: number[][] = [];
  const written: number[][] = [];

  const result: any = composeThenWrite<any>({
    compose: (draw) => {
      composed.push([draw!(), draw!(), randomSource()(), randomSource()()]);
      return { success: true };
    },
    write: (draw) => {
      // one draw past the composition's: the replay falls back to the source itself
      written.push([draw!(), draw!(), randomSource()(), randomSource()(), draw!()]);
      return { success: true };
    },
    random,
  });
  expect(result.success).toEqual(true);
  expect(written[0].slice(0, 4)).toEqual(composed[0]);
  expect(written[0][4]).toEqual(0.2);

  // the ambient stream is where the composition alone would have left it
  setRandomSource(7);
  const alone = [randomSource()(), randomSource()()];
  expect(alone).toEqual(composed[0].slice(2));
});

test('a composition that refuses is returned and nothing is written', () => {
  let writes = 0;
  const result: any = composeThenWrite<any>({
    compose: () => ({ error: 'refused' }),
    write: () => {
      writes += 1;
      return {};
    },
  });
  expect(result.error).toEqual('refused');
  expect(writes).toEqual(0);
});

test('a draw is stored when it is in the record, or when there is no record to look in', () => {
  const drawDefinition = {};
  expect(isStoredDraw({ drawDefinition })).toEqual(true);
  expect(
    isStoredDraw({ tournamentRecord: { events: [{ drawDefinitions: [drawDefinition] }] }, drawDefinition }),
  ).toEqual(true);
  expect(isStoredDraw({ tournamentRecord: { events: [{}] }, drawDefinition })).toEqual(false);
});
