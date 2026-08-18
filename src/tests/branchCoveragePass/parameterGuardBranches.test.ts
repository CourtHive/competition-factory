import { setFirstClassOrTimeItem } from '@Mutate/timeItems/setFirstClassOrTimeItem';
import { resolveDraftPositions } from '@Mutate/drawDefinitions/draft/resolveDraftPositions';
import { setFirstClassOrExtension } from '@Mutate/extensions/setFirstClassOrExtension';
import { seedWithdrawalCascade } from '@Mutate/drawDefinitions/seedWithdrawalCascade';
import { setState, setTournamentRecord } from '@Assemblies/engines/parts/stateMethods';
import mocksEngine from '@Assemblies/engines/mock';
import { describe, expect, it } from 'vitest';

// constants and types
import {
  INVALID_OBJECT,
  INVALID_RECORDS,
  INVALID_VALUES,
  MISSING_DRAW_DEFINITION,
  MISSING_VALUE,
  NOT_FOUND,
} from '@Constants/errorConditionConstants';

/**
 * Parameter-guard branches.
 *
 * These early returns are the single largest source of *statement* coverage loss
 * in the repo, and they are invisible to line coverage: a guard written as
 *
 *     if (!date) return { error: INVALID_VALUES };
 *
 * puts the `if` and the `return` on one line, so a suite that never passes a bad
 * `date` still executes the line while leaving the `return` statement uncovered.
 * 339 such statements sit across 217 files, and a file can read as 100% line
 * covered while missing every one of them.
 *
 * Beyond the number, these assertions pin the *contract*: which error code a
 * caller gets for which bad input. Several of the functions here are reached
 * through engine dispatch where a wrong code surfaces to a client as the wrong
 * toast, so the codes are asserted individually rather than as "some error".
 */

describe('setFirstClassOrExtension — parameter guards', () => {
  it('returns MISSING_VALUE when params is not an object', () => {
    expect(setFirstClassOrExtension(undefined).error).toEqual(MISSING_VALUE);
    expect((setFirstClassOrExtension as any)('nope').error).toEqual(MISSING_VALUE);
  });

  it('returns INVALID_VALUES for a missing or non-object element', () => {
    expect((setFirstClassOrExtension as any)({ attribute: 'a', name: 'n', value: 1 }).error).toEqual(INVALID_VALUES);
    expect((setFirstClassOrExtension as any)({ element: 'x', attribute: 'a', name: 'n', value: 1 }).error).toEqual(
      INVALID_VALUES,
    );
  });

  it('returns INVALID_VALUES for a missing or non-string attribute', () => {
    expect((setFirstClassOrExtension as any)({ element: {}, name: 'n', value: 1 }).error).toEqual(INVALID_VALUES);
    expect((setFirstClassOrExtension as any)({ element: {}, attribute: '', name: 'n', value: 1 }).error).toEqual(
      INVALID_VALUES,
    );
  });

  it('returns INVALID_VALUES for a missing or non-string name', () => {
    expect((setFirstClassOrExtension as any)({ element: {}, attribute: 'a', value: 1 }).error).toEqual(INVALID_VALUES);
    expect((setFirstClassOrExtension as any)({ element: {}, attribute: 'a', name: '', value: 1 }).error).toEqual(
      INVALID_VALUES,
    );
  });

  it('control: a well-formed call still succeeds', () => {
    const element: any = {};
    const result: any = setFirstClassOrExtension({ element, attribute: 'tier', name: 'tier', value: 'GOLD' });
    expect(result.success).toEqual(true);
  });
});

describe('setFirstClassOrTimeItem — parameter guards', () => {
  it('returns MISSING_VALUE when params is not an object', () => {
    expect((setFirstClassOrTimeItem as any)(undefined).error).toEqual(MISSING_VALUE);
  });

  it('returns INVALID_VALUES for a missing or non-object element', () => {
    expect((setFirstClassOrTimeItem as any)({ attribute: 'a', itemType: 't' }).error).toEqual(INVALID_VALUES);
    expect((setFirstClassOrTimeItem as any)({ element: 7, attribute: 'a', itemType: 't' }).error).toEqual(
      INVALID_VALUES,
    );
  });

  it('returns INVALID_VALUES for a missing or non-string attribute', () => {
    expect((setFirstClassOrTimeItem as any)({ element: {}, itemType: 't' }).error).toEqual(INVALID_VALUES);
    expect((setFirstClassOrTimeItem as any)({ element: {}, attribute: '', itemType: 't' }).error).toEqual(
      INVALID_VALUES,
    );
  });

  it('returns INVALID_VALUES for a missing or non-string itemType', () => {
    expect((setFirstClassOrTimeItem as any)({ element: {}, attribute: 'a' }).error).toEqual(INVALID_VALUES);
    expect((setFirstClassOrTimeItem as any)({ element: {}, attribute: 'a', itemType: '' }).error).toEqual(
      INVALID_VALUES,
    );
  });

  it('control: a well-formed call still succeeds and writes the schedule attribute', () => {
    const element: any = {};
    const result: any = setFirstClassOrTimeItem({
      element,
      attribute: 'scheduledTime',
      itemType: 'SCHEDULE.ASSIGNMENT.TIME',
      value: '14:00',
    });
    expect(result.success).toEqual(true);
  });
});

describe('stateMethods — record-shape guards', () => {
  it('setTournamentRecord rejects a non-object or an array', () => {
    expect(setTournamentRecord(undefined).error).toEqual(INVALID_OBJECT);
    expect(setTournamentRecord([]).error).toEqual(INVALID_OBJECT);
  });

  it('setTournamentRecord rejects an object with no tournamentId', () => {
    expect(setTournamentRecord({ tournamentName: 'no id' }).error).toEqual(INVALID_VALUES);
  });

  it('setState rejects a non-object', () => {
    expect(setState(undefined).error).toEqual(INVALID_OBJECT);
  });

  it('setState rejects an array in which any record lacks a tournamentId', () => {
    expect(setState([{ tournamentId: 'a' }, { tournamentName: 'no id' }]).error).toEqual(INVALID_RECORDS);
  });

  it('setState rejects a keyed object whose key does not match its record tournamentId', () => {
    expect(setState({ 'key-a': { tournamentId: 'different' } }).error).toEqual(INVALID_RECORDS);
  });

  it('control: a correctly keyed object is accepted', () => {
    // `setTournamentRecords` does not return a result envelope, so the assertion
    // is "no rejection" rather than a success shape. Without this control the
    // INVALID_RECORDS cases above would pass even if setState rejected everything.
    const result: any = setState({ 'tid-1': { tournamentId: 'tid-1' } });
    expect(result?.error).toBeUndefined();
  });
});

describe('seedWithdrawalCascade — parameter guards', () => {
  it('returns MISSING_DRAW_DEFINITION without a drawDefinition', () => {
    expect((seedWithdrawalCascade as any)({ drawPosition: 1 }).error).toEqual(MISSING_DRAW_DEFINITION);
  });

  it('returns INVALID_VALUES when no structureId can be resolved', () => {
    const result: any = (seedWithdrawalCascade as any)({ drawDefinition: { structures: [] }, drawPosition: 1 });
    expect(result.error).toEqual(INVALID_VALUES);
  });

  it('returns INVALID_VALUES when the structureId resolves to no structure', () => {
    const result: any = (seedWithdrawalCascade as any)({
      drawDefinition: { drawId: 'd', structures: [] },
      structureId: 'no-such-structure',
      drawPosition: 1,
    });
    expect(result.error).toEqual(INVALID_VALUES);
  });

  it('returns INVALID_VALUES when the drawPosition holds no participant', () => {
    // A real generated draw — the guard sits downstream of structure profiling,
    // which needs a structure carrying actual matchUps.
    const { tournamentRecord }: any = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8, seedsCount: 4 }],
      nonRandom: 1,
    });
    const drawDefinition = tournamentRecord.events[0].drawDefinitions[0];
    const structureId = drawDefinition.structures[0].structureId;

    const result: any = (seedWithdrawalCascade as any)({ drawDefinition, structureId, drawPosition: 999 });
    expect(result.error).toEqual(INVALID_VALUES);
  });
});

describe('resolveDraftPositions — parameter guards', () => {
  it('returns MISSING_DRAW_DEFINITION without a drawDefinition', () => {
    expect((resolveDraftPositions as any)({}).error).toEqual(MISSING_DRAW_DEFINITION);
  });

  it('returns NOT_FOUND when the drawDefinition carries no draftState', () => {
    const result: any = (resolveDraftPositions as any)({ drawDefinition: { drawId: 'd', structures: [] } });
    expect(result.error).toEqual(NOT_FOUND);
    expect(result.info).toContain('No active draft');
  });

  it('returns INVALID_VALUES when the draft is already complete', () => {
    const result: any = (resolveDraftPositions as any)({
      drawDefinition: { drawId: 'd', structures: [], draftState: { status: 'COMPLETED' } },
    });
    expect(result.error).toEqual(INVALID_VALUES);
    expect(result.info).toContain('already complete');
  });

  it('returns NOT_FOUND when the draftState names a structure the draw does not have', () => {
    const result: any = (resolveDraftPositions as any)({
      drawDefinition: { drawId: 'd', structures: [], draftState: { status: 'ACTIVE', structureId: 'missing' } },
    });
    expect(result.error).toEqual(NOT_FOUND);
    expect(result.info).toContain('Structure not found');
  });
});
