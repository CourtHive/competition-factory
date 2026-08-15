import { removeCollectionDefinition } from '@Mutate/tieFormat/removeCollectionDefinition';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants
import { INSUFFICIENT_UUIDS } from '@Constants/errorConditionConstants';
import { TEAM } from '@Constants/eventConstants';

/**
 * `tieFormatUuids` threading — the pool reaching `writeTieFormat`'s
 * copy-on-write fork from the mutations that own it.
 *
 * TWO POOLS, not one (decision CA 2026-08-15). `addCollectionDefinition` already
 * carries a `uuids` pool feeding **matchUp id** minting; sharing it with
 * tieFormat forks would couple unrelated id streams, and an `INSUFFICIENT_UUIDS`
 * error could not say which one ran short. `tieFormatUuids` is separate.
 *
 * The fork needs three preconditions — a centralized `tieFormatId`, a populated
 * `event.tieFormats`, and refCount > 1 — which is precisely the state
 * `aggregateTieFormats()` produces. Building it that way rather than by hand
 * keeps the test honest about the shape production actually reaches.
 */

function aggregatedTeamEvent() {
  const {
    tournamentRecord,
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4, eventType: TEAM }],
    nonRandom: 1,
  });
  tournamentEngine.setState(tournamentRecord);

  const aggregated: any = tournamentEngine.aggregateTieFormats();
  expect(aggregated.success).toEqual(true);

  const { event } = tournamentEngine.getEvent({ eventId });
  const { tournamentRecord: record } = tournamentEngine.getTournament();

  // Precondition the fork depends on — assert rather than assume.
  expect(event.tieFormats?.length).toBeGreaterThan(0);

  return { event, drawDefinition: event.drawDefinitions[0], tournamentRecord: record };
}

describe('removeCollectionDefinition — tieFormatUuids threading', () => {
  it('rejects an exhausted pool rather than silently minting', () => {
    // The load-bearing assertion. Strict-when-supplied has to survive the whole
    // call chain: mutation → applyTieFormatToScope/target resolution →
    // writeTieFormat. If the pool were dropped anywhere along the way this would
    // succeed instead of erroring.
    const { event, drawDefinition, tournamentRecord } = aggregatedTeamEvent();
    const collectionId = event.tieFormats[0].collectionDefinitions[0].collectionId;

    const result: any = removeCollectionDefinition({
      tournamentRecord,
      drawDefinition,
      collectionId,
      tieFormatUuids: [],
      event,
    });

    expect(result.error).toEqual(INSUFFICIENT_UUIDS);
  });

  it('does NOT error when no pool is supplied — absent is not empty', () => {
    // The negative direction. Without this, an implementation that treated "no
    // pool" as "empty pool" would satisfy the assertion above by accident.
    //
    // Driven through the engine rather than the raw mutation: the mutation's
    // downstream score-update path needs the full context the engine resolves
    // from ids, and that plumbing is not what is under test here.
    const { event } = aggregatedTeamEvent();
    const collectionId = event.tieFormats[0].collectionDefinitions[0].collectionId;

    const result: any = tournamentEngine.removeCollectionDefinition({
      drawId: event.drawDefinitions[0].drawId,
      eventId: event.eventId,
      collectionId,
    });

    expect(result.error).not.toEqual(INSUFFICIENT_UUIDS);
  });
});

/**
 * ⚠️ COVERAGE LIMITATION — read before assuming this file proves the whole change.
 *
 * Only the `processTargetMatchUp` fork inside `removeCollectionDefinition` is
 * provably covered here (verified by reverting `uuids: tieFormatUuids` on that
 * exact line and watching this suite fail).
 *
 * The MAIN-CHAIN write sites — the if/else target selection in
 * removeCollectionDefinition, addCollectionDefinition and collectionGroupUpdate
 * — are threaded identically but are NOT independently covered:
 *
 *   - in `removeCollectionDefinition` the earlier `processTargetMatchUp` fork
 *     always consumes/errors first, so the main-chain site is unreachable once a
 *     pool is short
 *   - `collectionGroupUpdate` with an aggregated fixture does not fork at all
 *     (the resolved target has refCount 1, so it updates in place)
 *
 * Building a fixture that reaches them is blocked by a PRE-EXISTING defect,
 * confirmed on master with these changes stashed: `aggregateTieFormats()`
 * followed by `removeCollectionDefinition` returns
 * `Cannot read properties of undefined (reading 'tieFormat')` from
 * `getItemTieFormat`. That corrupts exactly the aggregated state these tests
 * need. See the workstream notes.
 */
