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
 * COVERAGE — what this file proves, and what proves the rest.
 *
 * UPDATED 2026-08-15. An earlier version of this note said the remaining sites
 * were blocked by a pre-existing defect: `aggregateTieFormats()` followed by
 * `removeCollectionDefinition` threw `Cannot read properties of undefined
 * (reading 'tieFormat')` from `getItemTieFormat`. **That defect is fixed** (PR
 * #4623 guarded the optional `drawDefinition` / `event` dereferences) and the
 * sequence now succeeds — verified directly before rewriting this note.
 *
 * Removing the blocker did NOT make the other sites reachable, and the reason is
 * structural rather than a fixture problem. `writeTieFormat` forks only when a
 * centralized `tieFormatId` has `refCount > 1`. In these mutations the
 * matchUp-level processing runs FIRST and re-points every competing reference,
 * so by the time the main-chain write executes the event is the sole remaining
 * reference — `refCount === 1` — and it takes the in-place branch, minting
 * nothing and consuming no pool.
 *
 * Measured, not argued: instrumenting the fork and running the full suite shows
 * it is reached from exactly ONE site across all 10,912 tests —
 * `removeCollectionDefinition`'s `processTargetMatchUp` path, which is what this
 * file covers. The main-chain sites here, in `addCollectionDefinition` and in
 * `collectionGroupUpdate` are never reached. Three fixtures built through the
 * public API (single draw, two draws in one event, event-scoped write target)
 * all took the in-place branch.
 *
 * The threading on those unreached lines is therefore DEFENSIVE and correct to
 * keep — if a future change makes them reachable the pool must be honoured — but
 * no integration test can exercise them today.
 *
 * The fork's own behaviour is covered directly in
 * `writeTieFormatUuidPool.test.ts`: pool consumed, exhaustion errors, absent
 * pool mints, and the `refCount === 1` in-place branch that makes the above
 * unreachable is pinned as behaviour.
 *
 * ADDENDUM 2026-08-15 — fork MULTIPLICITY changed under this note.
 *
 * The single reachable site above used to fork once per TEAM matchUp, so a
 * drawSize-4 event consumed THREE ids and fragmented one shared tieFormat into
 * four. That was a defect, not a design: every matchUp was being written with
 * identical content. It is fixed by a per-operation `forkCache`
 * (`tieFormatForkFragmentation.test.ts`), and the operation now forks ONCE and
 * consumes ONE id.
 *
 * Everything this note says about WHICH sites are reachable is unchanged — still
 * exactly the `processTargetMatchUp` path. Only how many times it fires changed.
 */
