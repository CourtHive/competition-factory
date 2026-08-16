import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants
import { INSUFFICIENT_UUIDS } from '@Constants/errorConditionConstants';
import { TEAM_MATCHUP } from '@Constants/matchUpTypes';
import { TEAM } from '@Constants/eventConstants';

/**
 * A shared centralized tieFormat must NOT fragment into identical copies.
 *
 * `removeCollectionDefinition` on an aggregated event rewrites every TEAM
 * matchUp with the SAME pruned tieFormat. Each write hit `writeTieFormat`'s
 * copy-on-write fork independently, so one shared format became one identical
 * copy per matchUp:
 *
 *   drawSize 4  →  3 TEAM matchUps  →  event.tieFormats 1 → 4
 *
 * That is precisely what `aggregateTieFormats()` exists to prevent, and it is
 * unbounded: every subsequent scorecard edit fragments again. Re-running
 * aggregation re-points the references but leaves the orphaned entries behind
 * (`removeOrphanedTieFormats` is only wired into `resetTieFormat`).
 *
 * Fixed with a per-operation `forkCache`: the first fork mints, and any later
 * target forking from the same source with identical content joins it.
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
  expect(tournamentEngine.aggregateTieFormats().success).toEqual(true);

  const { event } = tournamentEngine.getEvent({ eventId });
  // Precondition: aggregation centralized to exactly one shared format.
  expect(event.tieFormats).toHaveLength(1);
  return { event, eventId, drawId: event.drawDefinitions[0].drawId };
}

function teamTieFormatIds(): string[] {
  return tournamentEngine
    .allTournamentMatchUps({ matchUpFilters: { matchUpTypes: [TEAM_MATCHUP] } })
    .matchUps.map((m: any) => m.tieFormatId);
}

describe('shared tieFormat does not fragment on removeCollectionDefinition', () => {
  it('forks ONCE for all matchUps rather than once each', () => {
    const { event, eventId, drawId } = aggregatedTeamEvent();
    const collectionId = event.tieFormats[0].collectionDefinitions[0].collectionId;

    const result: any = tournamentEngine.removeCollectionDefinition({ drawId, eventId, collectionId });
    expect(result.error).toBeUndefined();

    const after = tournamentEngine.getEvent({ eventId }).event;
    // One new shared entry alongside the original the EVENT still references —
    // not one per matchUp. Before the fix this was 4.
    expect(after.tieFormats).toHaveLength(2);

    const ids = teamTieFormatIds();
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toEqual(1);
  });

  it('consumes ONE id from the pool, not one per matchUp', () => {
    // The pool is the clearest witness: identity is minted once, so a replaying
    // instance needs exactly one id to reproduce this mutation.
    const { event, eventId, drawId } = aggregatedTeamEvent();
    const collectionId = event.tieFormats[0].collectionDefinitions[0].collectionId;
    const pool = ['tf-a', 'tf-b', 'tf-c'];

    const result: any = tournamentEngine.removeCollectionDefinition({
      drawId,
      eventId,
      collectionId,
      tieFormatUuids: pool,
    });

    expect(result.error).toBeUndefined();
    expect(pool).toHaveLength(2);
    expect(new Set(teamTieFormatIds())).toEqual(new Set(['tf-c']));
  });

  it('a single-id pool is now SUFFICIENT — it was not before', () => {
    // Directly encodes the behaviour change. One id used to fail with
    // INSUFFICIENT_UUIDS because three forks were attempted.
    const { event, eventId, drawId } = aggregatedTeamEvent();
    const collectionId = event.tieFormats[0].collectionDefinitions[0].collectionId;

    const result: any = tournamentEngine.removeCollectionDefinition({
      drawId,
      eventId,
      collectionId,
      tieFormatUuids: ['only-one'],
    });

    expect(result.error).toBeUndefined();
    expect(new Set(teamTieFormatIds())).toEqual(new Set(['only-one']));
  });

  it('an EMPTY pool still errors — strictness is unchanged', () => {
    // The fork still happens; only its multiplicity changed. Strict-when-supplied
    // must survive the fix.
    const { event, eventId, drawId } = aggregatedTeamEvent();
    const collectionId = event.tieFormats[0].collectionDefinitions[0].collectionId;

    const result: any = tournamentEngine.removeCollectionDefinition({
      drawId,
      eventId,
      collectionId,
      tieFormatUuids: [],
    });

    expect(result.error).toEqual(INSUFFICIENT_UUIDS);
  });

  it('leaves NO orphaned entries, even after re-aggregating', () => {
    // The fragmentation had a second-order cost. Pre-fix, the three identical
    // copies survived as stored entries; re-running aggregation de-duplicated the
    // REFERENCES to one id but left the other two stranded with no referent:
    //
    //   pre-fix:   after remove  stored 4 / orphans 0
    //              re-aggregate  stored 4 / orphans 2
    //   post-fix:  after remove  stored 2 / orphans 0
    //              re-aggregate  stored 2 / orphans 0
    //
    // Measured both ways by checking out master's writeTieFormat alongside this
    // fix. So orphan accumulation on this path was an ARTIFACT of the
    // fragmentation, not an independent defect — which is why no
    // `removeOrphanedTieFormats` call is added here. `resetTieFormat` remains its
    // only production caller, and that stays correct.
    const { event, eventId, drawId } = aggregatedTeamEvent();
    const collectionId = event.tieFormats[0].collectionDefinitions[0].collectionId;

    tournamentEngine.removeCollectionDefinition({ drawId, eventId, collectionId });
    expect(tournamentEngine.aggregateTieFormats().success).toEqual(true);

    const after = tournamentEngine.getEvent({ eventId }).event;
    const referenced = new Set<string>();
    if (after.tieFormatId) referenced.add(after.tieFormatId);
    for (const dd of after.drawDefinitions ?? []) {
      if (dd.tieFormatId) referenced.add(dd.tieFormatId);
      for (const st of dd.structures ?? []) if (st.tieFormatId) referenced.add(st.tieFormatId);
    }
    for (const id of teamTieFormatIds()) if (id) referenced.add(id);

    const orphans = (after.tieFormats ?? [])
      .map((tf: any) => tf.tieFormatId)
      .filter((id: string) => !referenced.has(id));

    expect(orphans).toEqual([]);
  });

  it('the removed collection is actually gone from the shared format', () => {
    // Guards against "de-duplicated" turning into "did not apply the edit".
    const { event, eventId, drawId } = aggregatedTeamEvent();
    const collectionId = event.tieFormats[0].collectionDefinitions[0].collectionId;

    tournamentEngine.removeCollectionDefinition({ drawId, eventId, collectionId });

    const after = tournamentEngine.getEvent({ eventId }).event;
    const sharedId = teamTieFormatIds()[0];
    const shared = after.tieFormats.find((tf: any) => tf.tieFormatId === sharedId);

    expect(shared).toBeDefined();
    expect(shared.collectionDefinitions.some((c: any) => c.collectionId === collectionId)).toBe(false);
  });
});
