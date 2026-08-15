import { writeTieFormat } from '@Mutate/tieFormat/writeTieFormat';
import { describe, expect, it } from 'vitest';

// constants
import { INSUFFICIENT_UUIDS } from '@Constants/errorConditionConstants';

/**
 * Replay fidelity for the tieFormatId minted by `writeTieFormat`'s copy-on-write
 * fork.
 *
 * WHY A POOL IS NEEDED HERE. TMX does not mutate-then-refetch — it executes the
 * same `methods` array TWICE, independently:
 *
 *   1. CFS executes it and acks (`serverFirst`, the default)
 *   2. on ack the client re-runs it locally via
 *      `engineExecution({ factoryEngine, methods })` and writes to IndexedDB
 *      (`TMX/src/services/mutation/mutationRequest.ts`)
 *
 * TMX's established discipline is to make that reproducible by minting at the
 * ORIGIN and threading the ids through params — whole generated objects
 * (`generateDraw.ts` ships the entire `drawDefinition`) or an explicit pool
 * (`addFlights.ts` passes `tools.UUIDS(flightsCount)`,
 * `pairFromUnified.ts` passes `uuids: [participantId]`). Where that discipline is
 * applied, both executions agree. This is NOT a claim that TMX is careless.
 *
 * The gap `writeTieFormat` represents is different in kind: its copy-on-write
 * fork mints an id for an entity the caller never asked to create, so a caller
 * CANNOT pre-supply it by naming it — and until this change the engine offered no
 * pool on that path to thread one through either. `MODIFY_TIE_FORMAT` accordingly
 * passes no pool today.
 *
 * These tests pin the function's behaviour with and without a pool. Whether the
 * fork is reached by a given production flow additionally depends on its
 * preconditions (centralized `tieFormatId`, populated `event.tieFormats`,
 * refCount > 1) — NOT verified against production data, and not claimed here.
 *
 * Tested at the unit level rather than through the engine because the fork has
 * three preconditions (centralized `tieFormatId`, populated `event.tieFormats`,
 * and refCount > 1) that are far clearer to construct directly than to arrange
 * via a seeded tournament.
 */

const COLLECTION = { collectionId: 'c1', collectionName: 'Singles', matchUpCount: 1, matchUpValue: 1 };

/**
 * An event where BOTH the event and its drawDefinition reference the same
 * tieFormatId — refCount 2, so writing to either target forks.
 */
function sharedReferenceEvent(): any {
  return {
    eventId: 'e1',
    tieFormatId: 'shared-tf',
    tieFormats: [{ tieFormatId: 'shared-tf', collectionDefinitions: [COLLECTION], winCriteria: { valueGoal: 1 } }],
    drawDefinitions: [{ drawId: 'd1', tieFormatId: 'shared-tf', structures: [] }],
  };
}

const modifiedTieFormat: any = {
  collectionDefinitions: [{ ...COLLECTION, matchUpCount: 2 }],
  winCriteria: { valueGoal: 2 },
};

describe('writeTieFormat copy-on-write id', () => {
  it('forks to a NEW id — a supplied pool must not write back onto the shared format', () => {
    const event = sharedReferenceEvent();
    const target = event.drawDefinitions[0];

    const error = writeTieFormat({ target, tieFormat: modifiedTieFormat, event, uuids: ['forked-1'] });

    expect(error).toBeUndefined();
    // The fork happened: the target moved off the shared id.
    expect(target.tieFormatId).toEqual('forked-1');
    expect(target.tieFormatId).not.toEqual('shared-tf');
    // And the shared format the EVENT still points at was left untouched — this
    // is why the pool supplies a mint value rather than naming the id outright.
    expect(event.tieFormatId).toEqual('shared-tf');
    const shared = event.tieFormats.find((tf: any) => tf.tieFormatId === 'shared-tf');
    expect(shared.collectionDefinitions[0].matchUpCount).toEqual(1);
  });

  it('two instances replaying the same call with the same pool agree on the id', () => {
    // The server run and the client re-run, modelled explicitly.
    const serverEvent = sharedReferenceEvent();
    writeTieFormat({
      target: serverEvent.drawDefinitions[0],
      tieFormat: modifiedTieFormat,
      event: serverEvent,
      uuids: ['agreed-id'],
    });

    const clientEvent = sharedReferenceEvent();
    writeTieFormat({
      target: clientEvent.drawDefinitions[0],
      tieFormat: modifiedTieFormat,
      event: clientEvent,
      uuids: ['agreed-id'],
    });

    expect(serverEvent.drawDefinitions[0].tieFormatId).toEqual(clientEvent.drawDefinitions[0].tieFormatId);
  });

  it('WITHOUT a pool the two instances diverge — the defect this closes', () => {
    // Documents current behaviour when no pool is threaded. If this ever starts
    // failing because the ids match, minting has become deterministic by some
    // other route — investigate before deleting the test.
    const serverEvent = sharedReferenceEvent();
    writeTieFormat({ target: serverEvent.drawDefinitions[0], tieFormat: modifiedTieFormat, event: serverEvent });

    const clientEvent = sharedReferenceEvent();
    writeTieFormat({ target: clientEvent.drawDefinitions[0], tieFormat: modifiedTieFormat, event: clientEvent });

    expect(serverEvent.drawDefinitions[0].tieFormatId).not.toEqual(clientEvent.drawDefinitions[0].tieFormatId);
  });

  it('rejects an exhausted pool instead of minting the shortfall', () => {
    const event = sharedReferenceEvent();
    const target = event.drawDefinitions[0];

    const result: any = writeTieFormat({ target, tieFormat: modifiedTieFormat, event, uuids: [] });

    expect(result?.error).toEqual(INSUFFICIENT_UUIDS);
    // The target must be left alone rather than half-forked.
    expect(target.tieFormatId).toEqual('shared-tf');
  });

  it('still mints when no pool is supplied — an absent pool is not an empty pool', () => {
    // The distinction the strict helper turns on: `undefined` means "no pool",
    // `[]` means "pool supplied and exhausted".
    const event = sharedReferenceEvent();
    const target = event.drawDefinitions[0];

    const error = writeTieFormat({ target, tieFormat: modifiedTieFormat, event });

    expect(error).toBeUndefined();
    expect(typeof target.tieFormatId).toEqual('string');
    expect(target.tieFormatId).not.toEqual('shared-tf');
  });

  it('does not consume from the pool when updating in place (refCount 1)', () => {
    // Only the FORK mints. A sole reference updates the centralized entry and
    // keeps its id, so a pool passed alongside must come back untouched —
    // otherwise pool alignment would drift between instances.
    const event = sharedReferenceEvent();
    // Drop the second reference so only the drawDefinition points at it.
    delete event.tieFormatId;
    const target = event.drawDefinitions[0];
    const uuids = ['unused-1'];

    const error = writeTieFormat({ target, tieFormat: modifiedTieFormat, event, uuids });

    expect(error).toBeUndefined();
    expect(target.tieFormatId).toEqual('shared-tf');
    expect(uuids).toEqual(['unused-1']);
  });
});
