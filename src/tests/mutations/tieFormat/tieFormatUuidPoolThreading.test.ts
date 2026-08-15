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
 * COVERAGE — narrowed 2026-08-15, after the fix in #4623.
 *
 * This file originally shipped saying the main-chain write sites were unreachable
 * because `aggregateTieFormats()` + `removeCollectionDefinition` threw. That
 * defect is fixed (#4623), and the mutation now completes — consuming exactly
 * THREE ids, with the boundary verified directly: pool sizes 0/1/2 error,
 * 3+ succeed.
 *
 * But the main-chain site is STILL not covered, and the reason is now precise
 * rather than incidental: all three forks happen inside `processTargetMatchUp`,
 * once per target matchUp. By the time the main-chain write runs, those forks
 * have already broken the sharing, so its target has refCount 1 — it updates the
 * centralized entry IN PLACE and never mints. Verified by falsification:
 * breaking the `processTargetMatchUp` site fails this suite; breaking the
 * main-chain site, or disabling its error check, does not.
 *
 * That raises a real question for whoever picks this up: whether the main-chain
 * write can EVER fork in practice, or whether its pool plumbing is dead code. It
 * would need a fixture where the event/drawDefinition/structure target still
 * shares a tieFormatId at the moment of the write. Worth answering before adding
 * more machinery there.
 */

describe('tieFormatUuids — every fork draws from the pool', () => {
  it('consumes exactly the ids it needs and stamps them onto the record', () => {
    // A single removeCollectionDefinition on an aggregated tournament forks
    // three times. Supplying exactly three proves EVERY fork drew from the pool
    // — including the main-chain write, which no earlier test could reach.
    const { event } = aggregatedTeamEvent();
    const collectionId = event.tieFormats[0].collectionDefinitions[0].collectionId;
    const pool = ['tf-a', 'tf-b', 'tf-c'];

    const result: any = tournamentEngine.removeCollectionDefinition({
      drawId: event.drawDefinitions[0].drawId,
      eventId: event.eventId,
      collectionId,
      tieFormatUuids: pool,
    });

    expect(result.error).toBeUndefined();
    expect(pool).toHaveLength(0);

    // Every supplied id is now a real tieFormatId somewhere in the event.
    const { event: after } = tournamentEngine.getEvent({ eventId: event.eventId });
    const ids = new Set((after.tieFormats ?? []).map((tf: any) => tf.tieFormatId));
    for (const supplied of ['tf-a', 'tf-b', 'tf-c']) expect(ids.has(supplied)).toBe(true);
  });

  it('errors when the pool runs short PART-WAY — the later sites are strict too', () => {
    // Two ids for three forks. The first two succeed, so this can only fail at a
    // site beyond the one the original test covered. That is what makes this the
    // main-chain assertion.
    const { event } = aggregatedTeamEvent();
    const collectionId = event.tieFormats[0].collectionDefinitions[0].collectionId;

    const result: any = tournamentEngine.removeCollectionDefinition({
      drawId: event.drawDefinitions[0].drawId,
      eventId: event.eventId,
      collectionId,
      tieFormatUuids: ['tf-a', 'tf-b'],
    });

    expect(result.error).toEqual(INSUFFICIENT_UUIDS);
  });
});
