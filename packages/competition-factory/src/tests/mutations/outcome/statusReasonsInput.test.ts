import {
  callStatusReasons,
  readStatusReasonsInput,
  writeStatusReasons,
} from '@Mutate/matchUps/matchUpStatus/sideStatusCodes';
import { dropLegacyStatusCodes } from '@Helpers/drawTopology/legacyStatusCodes';
import { keyedStatusCodes } from '../../../scoreEntryState';
import { holdsReasons } from '@Mutate/matchUps/outcome/reasons';
import { describe, expect, it } from 'vitest';

// constants
import { ABANDONED, COMPLETED, DEFAULTED, DOUBLE_WALKOVER, RETIRED } from '@Constants/matchUpStatusConstants';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';

describe('an outcome submits its reasons keyed, and the shape is checked before anything is written', () => {
  it.each([
    ['the positional array', { matchUpStatusCodes: ['', 'DM'] }],
    ['a clear that is not a boolean', { clearStatusCodes: 'yes' }],
    ['an empty match-level reason', { matchUpStatusCode: '' }],
    ['a match-level reason that is not a string', { matchUpStatusCode: 3 }],
    ['side reasons as an array', { sideStatusCodes: ['DM'] }],
    ['side reasons that are not an object', { sideStatusCodes: 'DM' }],
    ['a side that is not 1 or 2', { sideStatusCodes: { 3: 'DM' } }],
    ['an empty side reason', { sideStatusCodes: { 2: '' } }],
  ])('refuses %s', (_label, outcome) => {
    expect(readStatusReasonsInput(outcome as any).error).toEqual(INVALID_VALUES);
  });

  it('reads submitted reasons and the explicit clear, and nothing from an outcome without them', () => {
    expect(readStatusReasonsInput(undefined)).toEqual({});
    expect(readStatusReasonsInput({}).input).toEqual({});
    expect(readStatusReasonsInput({ sideStatusCodes: {} }).input).toEqual({});
    expect(readStatusReasonsInput({ sideStatusCodes: { 2: 'DM' }, clearStatusCodes: true }).input).toEqual({
      submitted: { sideStatusCodes: { 2: 'DM' } },
      clear: true,
    });
    expect(readStatusReasonsInput({ matchUpStatusCode: 'OA' }).input).toEqual({
      submitted: { matchUpStatusCode: 'OA' },
    });
  });
});

describe('a call writes its reasons from the result it leaves', () => {
  const matchUp = (fields: any): any => ({ matchUpId: 'm', ...fields });
  it('keeps a reason that still describes the result, and drops one that does not', () => {
    const held = matchUp({ matchUpStatus: DEFAULTED, winningSide: 1, sideStatusCodes: { 2: 'DM' } });
    const reasons = callStatusReasons('m', {}, held);
    writeStatusReasons(held, reasons);
    expect(held.sideStatusCodes).toEqual({ 2: 'DM' });
    held.winningSide = 2;
    writeStatusReasons(held, reasons);
    expect(held.sideStatusCodes).toBeUndefined();
  });
  it('drops every reason on a status that takes none, and keeps a match-level reason on one that does', () => {
    const played = matchUp({ matchUpStatus: COMPLETED, winningSide: 1, sideStatusCodes: { 2: 'RJ' } });
    writeStatusReasons(played, callStatusReasons('m', {}, played));
    expect(played.sideStatusCodes).toBeUndefined();
    const abandoned = matchUp({ matchUpStatus: ABANDONED, matchUpStatusCode: 'OA' });
    writeStatusReasons(abandoned, callStatusReasons('m', {}, abandoned));
    expect(abandoned.matchUpStatusCode).toEqual('OA');
  });
  it('replaces with submitted reasons, filtered by attribution, and clears on the explicit clear', () => {
    const exit = matchUp({ matchUpStatus: DOUBLE_WALKOVER, sideStatusCodes: { 1: 'A' } });
    writeStatusReasons(exit, callStatusReasons('m', { submitted: { sideStatusCodes: { 1: 'W', 2: 'W' } } }, exit));
    expect(exit.sideStatusCodes).toEqual({ 1: 'W', 2: 'W' });
    writeStatusReasons(exit, callStatusReasons('m', { clear: true }, exit));
    expect(exit.sideStatusCodes).toBeUndefined();
  });
});

describe('the helpers around the keyed reasons', () => {
  it('holdsReasons asks the match-level and the side reasons', () => {
    expect(holdsReasons(undefined)).toEqual(false);
    expect(holdsReasons({})).toEqual(false);
    expect(holdsReasons({ matchUpStatusCode: 'OA' })).toEqual(true);
    expect(holdsReasons({ sideStatusCodes: { 2: 'DM' } })).toEqual(true);
    expect(holdsReasons({ sideStatusCodes: {} })).toEqual(false);
  });
  it('dropLegacyStatusCodes removes the positional array and leaves everything else', () => {
    const legacy: any = { matchUpStatusCodes: ['', 'W1'], sideStatusCodes: { 2: 'W1' } };
    dropLegacyStatusCodes(legacy);
    expect(legacy).toEqual({ sideStatusCodes: { 2: 'W1' } });
    dropLegacyStatusCodes(undefined);
  });
  it('keyedStatusCodes attributes a reason to the side that exited, both sides, or the match', () => {
    expect(keyedStatusCodes({ matchUpStatus: RETIRED, winningSide: 1, reasonCode: 'RJ' })).toEqual({
      sideStatusCodes: { 2: 'RJ' },
    });
    expect(keyedStatusCodes({ matchUpStatus: DOUBLE_WALKOVER, reasonCode: 'W' })).toEqual({
      sideStatusCodes: { 1: 'W', 2: 'W' },
    });
    expect(keyedStatusCodes({ matchUpStatus: ABANDONED, reasonCode: 'OA' })).toEqual({ matchUpStatusCode: 'OA' });
    expect(keyedStatusCodes({ matchUpStatus: RETIRED, winningSide: 1 })).toBeUndefined();
  });
});
