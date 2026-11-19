import * as ladderModule from '@Constants/ladderConstants';
import * as factory from '../../index';
import { expect, it } from 'vitest';

/**
 * THE LADDER VOCABULARY IS EXPORTED, AND ALL OF IT.
 *
 * `ladderConstants` was written with the ladder's first values and never exported; result validation
 * (`PEER`/`OPERATOR`/`EITHER`), challenge states, movement triggers and the lapse rules arrived later and were left
 * out of it, so a host writing a ladder policy typed `'EITHER'` by hand. Every value and value list the module
 * exports must be a member, so the next one cannot be left out the same way.
 */

it('every value and value list of the module is on ladderConstants', () => {
  const { ladderConstants, ...exported } = ladderModule;
  const names = Object.keys(exported);
  // CONTROL: the module was read, including a value the old namespace lacked
  expect(names).toContain('EITHER');
  expect(names.length).toBeGreaterThan(30);

  expect(names.filter((name) => !(name in ladderConstants))).toEqual([]);
  for (const name of names) expect(ladderConstants[name]).toBe(exported[name]);
});

it('is exported from the package, beside the other constants', () => {
  expect(factory.ladderConstants.EITHER).toEqual('EITHER');
  expect(factory.factoryConstants.ladderConstants.resultValidations).toEqual(['PEER', 'OPERATOR', 'EITHER']);
});
