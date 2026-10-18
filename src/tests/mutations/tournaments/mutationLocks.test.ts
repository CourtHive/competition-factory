import { tournamentGovernor } from '@Assemblies/governors';
import { mocksEngine } from '@Assemblies/engines/mock';
import { tournamentEngine } from '@Engines/syncEngine';
import { expect, it, describe } from 'vitest';

// constants
import { COMPLETED } from '@Constants/matchUpStatusConstants';
import { SINGLES_EVENT } from '@Constants/eventConstants';
import {
  INVALID_VALUES,
  MISSING_VALUE,
  MUTATION_LOCKED,
  MUTATION_LOCK_EXISTS,
} from '@Constants/errorConditionConstants';

describe('Mutation Locks', () => {
  // ─── Opt-in behavior ──────────────────────────────────

  it('mutations are NOT checked when no mutation locks feature gate exists', () => {
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }],
      setState: true,
    });

    // No addMutationLock called — feature is not enabled
    // All mutations should work normally without any lock overhead
    const result = tournamentEngine.clearScheduledMatchUps({ drawId });
    expect(result.error).not.toEqual(MUTATION_LOCKED);
  });

  it('addMutationLock auto-enables the feature gate on tournamentRecord', () => {
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }],
      setState: true,
    });

    // Adding a lock at any level enables the tournament-level gate
    const result = tournamentEngine.addMutationLock({
      scope: 'SCORING',
      lockToken: 'token-1',
      drawId,
    });
    expect(result.success).toEqual(true);

    // The feature gate should now be enabled, so scoring is locked on that draw
    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    const matchUp = matchUps.find((m) => m.drawPositions?.filter(Boolean).length === 2);

    const scoreResult = tournamentEngine.setMatchUpStatus({
      matchUpId: matchUp.matchUpId,
      drawId,
      outcome: { matchUpStatus: COMPLETED, winningSide: 1 },
    });
    expect(scoreResult.error).toEqual(MUTATION_LOCKED);
  });

  // ─── CRUD ───────────────────────────────────────────────

  it('addMutationLock creates lock and returns lockId', () => {
    mocksEngine.generateTournamentRecord({ setState: true });

    const result = tournamentEngine.addMutationLock({
      scope: 'SCHEDULING',
      lockToken: 'token-1',
    });
    expect(result.success).toEqual(true);
    expect(result.lockId).toBeDefined();
  });

  it('getMutationLocks returns active locks', () => {
    mocksEngine.generateTournamentRecord({ setState: true });

    tournamentEngine.addMutationLock({ scope: 'SCHEDULING', lockToken: 'token-1' });
    tournamentEngine.addMutationLock({ scope: 'SCORING', lockToken: 'token-2' });

    const { mutationLocks } = tournamentEngine.getMutationLocks();
    expect(mutationLocks.length).toEqual(2);
    expect(mutationLocks.map((l) => l.scope).sort()).toEqual(['SCHEDULING', 'SCORING']);
  });

  it('addMutationLock on same scope with different token returns MUTATION_LOCK_EXISTS', () => {
    mocksEngine.generateTournamentRecord({ setState: true });

    tournamentEngine.addMutationLock({ scope: 'SCHEDULING', lockToken: 'token-1' });
    const result = tournamentEngine.addMutationLock({ scope: 'SCHEDULING', lockToken: 'token-2' });
    expect(result.error).toEqual(MUTATION_LOCK_EXISTS);
  });

  it('addMutationLock on same scope with same token upserts', () => {
    mocksEngine.generateTournamentRecord({ setState: true });

    const { lockId } = tournamentEngine.addMutationLock({
      scope: 'SCHEDULING',
      lockToken: 'token-1',
      expiresAt: '2099-01-01T00:00:00.000Z',
    });

    const result = tournamentEngine.addMutationLock({
      scope: 'SCHEDULING',
      lockToken: 'token-1',
      expiresAt: '2099-06-01T00:00:00.000Z',
    });
    expect(result.success).toEqual(true);
    expect(result.lockId).toEqual(lockId);

    const { mutationLocks } = tournamentEngine.getMutationLocks();
    expect(mutationLocks.length).toEqual(1);
    expect(mutationLocks[0].expiresAt).toEqual('2099-06-01T00:00:00.000Z');
  });

  it('validation: missing scope', () => {
    mocksEngine.generateTournamentRecord({ setState: true });

    const result = tournamentEngine.addMutationLock({ lockToken: 'token-1' });
    expect(result.error).toEqual(MISSING_VALUE);
  });

  it('validation: missing lockToken', () => {
    mocksEngine.generateTournamentRecord({ setState: true });

    const result = tournamentEngine.addMutationLock({ scope: 'SCHEDULING' });
    expect(result.error).toEqual(MISSING_VALUE);
  });

  it('validation: invalid expiresAt', () => {
    mocksEngine.generateTournamentRecord({ setState: true });

    const result = tournamentEngine.addMutationLock({
      scope: 'SCHEDULING',
      lockToken: 'token-1',
      expiresAt: 'not-a-date',
    });
    expect(result.error).toEqual(INVALID_VALUES);
  });

  it('removeMutationLock by scope', () => {
    mocksEngine.generateTournamentRecord({ setState: true });

    tournamentEngine.addMutationLock({ scope: 'SCHEDULING', lockToken: 'token-1' });
    const result = tournamentEngine.removeMutationLock({ scope: 'SCHEDULING', lockToken: 'token-1' });
    expect(result.success).toEqual(true);
  });

  // ─── Lock Enforcement ──────────────────────────────────

  it('tournament-level SCHEDULING lock blocks scheduling mutations without lockToken', () => {
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }],
      setState: true,
    });

    tournamentEngine.addMutationLock({ scope: 'SCHEDULING', lockToken: 'token-1' });

    const result = tournamentEngine.clearScheduledMatchUps({ drawId });
    expect(result.error).toEqual(MUTATION_LOCKED);
  });

  it('correct lockToken passes the lock check', () => {
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }],
      setState: true,
    });

    tournamentEngine.addMutationLock({ scope: 'SCHEDULING', lockToken: 'token-1' });

    // clearScheduledMatchUps with the correct token should pass the lock check
    const result = tournamentEngine.clearScheduledMatchUps({ drawId, lockToken: 'token-1' });
    // The call should not return MUTATION_LOCKED (it may succeed or fail for other reasons)
    expect(result.error).not.toEqual(MUTATION_LOCKED);
  });

  it('wrong lockToken is rejected', () => {
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }],
      setState: true,
    });

    tournamentEngine.addMutationLock({ scope: 'SCHEDULING', lockToken: 'token-1' });

    const result = tournamentEngine.clearScheduledMatchUps({ drawId, lockToken: 'wrong-token' });
    expect(result.error).toEqual(MUTATION_LOCKED);
  });

  it('query methods are never blocked', () => {
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }],
      setState: true,
    });

    // Lock all common scopes
    tournamentEngine.addMutationLock({ scope: 'SCHEDULING', lockToken: 'token-1' });
    tournamentEngine.addMutationLock({ scope: 'SCORING', lockToken: 'token-2' });
    tournamentEngine.addMutationLock({ scope: 'DRAWS', lockToken: 'token-3' });

    // Queries should still work
    const matchUpsResult = tournamentEngine.allTournamentMatchUps();
    expect(matchUpsResult.matchUps).toBeDefined();

    const infoResult = tournamentEngine.getTournamentInfo();
    expect(infoResult).toBeDefined();
  });

  it('expired lock allows the call (lazy cleanup)', () => {
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }],
      setState: true,
    });

    // Create a lock that has already expired
    tournamentEngine.addMutationLock({
      scope: 'SCHEDULING',
      lockToken: 'token-1',
      expiresAt: '2020-01-01T00:00:00.000Z', // in the past
    });

    const result = tournamentEngine.clearScheduledMatchUps({ drawId });
    expect(result.error).not.toEqual(MUTATION_LOCKED);
  });

  it('permanent lock (expiresAt: null) never expires', () => {
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }],
      setState: true,
    });

    tournamentEngine.addMutationLock({
      scope: 'SCHEDULING',
      lockToken: 'token-1',
      expiresAt: null,
    });

    const result = tournamentEngine.clearScheduledMatchUps({ drawId });
    expect(result.error).toEqual(MUTATION_LOCKED);
  });

  // ─── Method-Level Locks ────────────────────────────────

  it('lock with methods array blocks only specified methods', () => {
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }],
      setState: true,
    });

    // Lock only deleteDrawDefinitions within EVENTS scope
    tournamentEngine.addMutationLock({
      scope: 'EVENTS',
      lockToken: 'admin-token',
      methods: ['deleteDrawDefinitions', 'deleteEvents'],
    });

    // addEvent should NOT be blocked (not in methods list)
    const addResult = tournamentEngine.addEvent({
      event: { eventName: 'Test', eventType: SINGLES_EVENT },
    });
    expect(addResult.error).not.toEqual(MUTATION_LOCKED);

    // deleteEvents SHOULD be blocked (in methods list)
    const deleteResult = tournamentEngine.deleteEvents({ eventIds: ['nonexistent'] });
    expect(deleteResult.error).toEqual(MUTATION_LOCKED);
  });

  it('correct lockToken still passes method-level locks', () => {
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }],
      setState: true,
    });

    tournamentEngine.addMutationLock({
      scope: 'EVENTS',
      lockToken: 'admin-token',
      methods: ['deleteEvents'],
    });

    // With correct token, the lock check passes
    const result = tournamentEngine.deleteEvents({
      eventIds: ['nonexistent'],
      lockToken: 'admin-token',
    });
    expect(result.error).not.toEqual(MUTATION_LOCKED);
  });

  // ─── Element-Scoped Locks ─────────────────────────────

  it('draw-level lock blocks scoring on that draw', () => {
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }],
      setState: true,
    });

    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    const matchUp = matchUps.find((m) => m.drawPositions?.filter(Boolean).length === 2);

    // Add lock on the draw
    tournamentEngine.addMutationLock({
      scope: 'SCORING',
      lockToken: 'scorer-token',
      drawId,
    });

    // Scoring without token should be blocked
    const result = tournamentEngine.setMatchUpStatus({
      matchUpId: matchUp.matchUpId,
      drawId,
      outcome: { matchUpStatus: COMPLETED, winningSide: 1 },
    });
    expect(result.error).toEqual(MUTATION_LOCKED);

    // With correct token should pass lock check
    const result2 = tournamentEngine.setMatchUpStatus({
      matchUpId: matchUp.matchUpId,
      drawId,
      outcome: { matchUpStatus: COMPLETED, winningSide: 1 },
      lockToken: 'scorer-token',
    });
    expect(result2.error).not.toEqual(MUTATION_LOCKED);
  });

  it('event-level lock blocks mutations on draws within that event (hierarchical)', () => {
    const {
      drawIds: [drawId],
      eventIds: [eventId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }],
      setState: true,
    });

    // Lock at event level
    tournamentEngine.addMutationLock({
      scope: 'SCORING',
      lockToken: 'event-token',
      eventId,
    });

    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    const matchUp = matchUps.find((m) => m.drawPositions?.filter(Boolean).length === 2);

    // Scoring a matchUp in this draw should be blocked by the event-level lock
    const result = tournamentEngine.setMatchUpStatus({
      matchUpId: matchUp.matchUpId,
      drawId,
      outcome: { matchUpStatus: COMPLETED, winningSide: 1 },
    });
    expect(result.error).toEqual(MUTATION_LOCKED);
  });

  it('tournament-level lock blocks mutations on all draws (hierarchical)', () => {
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }],
      setState: true,
    });

    // Lock at tournament level
    tournamentEngine.addMutationLock({
      scope: 'SCORING',
      lockToken: 'tournament-token',
    });

    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    const matchUp = matchUps.find((m) => m.drawPositions?.filter(Boolean).length === 2);

    const result = tournamentEngine.setMatchUpStatus({
      matchUpId: matchUp.matchUpId,
      drawId,
      outcome: { matchUpStatus: COMPLETED, winningSide: 1 },
    });
    expect(result.error).toEqual(MUTATION_LOCKED);
  });

  it('getMutationLocks traverses all elements', () => {
    const {
      drawIds: [drawId],
      eventIds: [eventId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }],
      setState: true,
    });

    // Add locks at different levels
    tournamentEngine.addMutationLock({ scope: 'SCHEDULING', lockToken: 'token-1' });
    tournamentEngine.addMutationLock({ scope: 'SCORING', lockToken: 'token-2', eventId });
    tournamentEngine.addMutationLock({ scope: 'DRAWS', lockToken: 'token-3', drawId });

    const { mutationLocks } = tournamentEngine.getMutationLocks();
    expect(mutationLocks.length).toEqual(3);

    const tournamentLock = mutationLocks.find((l) => l.scope === 'SCHEDULING');
    expect(tournamentLock.eventId).toBeUndefined();
    expect(tournamentLock.drawId).toBeUndefined();

    const eventLock = mutationLocks.find((l) => l.scope === 'SCORING');
    expect(eventLock.eventId).toEqual(eventId);

    const drawLock = mutationLocks.find((l) => l.scope === 'DRAWS');
    expect(drawLock.drawId).toEqual(drawId);
  });

  it('venue-level lock blocks venue-scoped mutations on that venue only', () => {
    mocksEngine.generateTournamentRecord({ setState: true });
    const venueId = tournamentEngine.addVenue({ venue: { venueName: 'Locked Venue' } }).venue.venueId;
    const otherVenueId = tournamentEngine.addVenue({ venue: { venueName: 'Open Venue' } }).venue.venueId;

    tournamentEngine.addMutationLock({ scope: 'VENUES', lockToken: 'venue-token', venueId });

    let result: any = tournamentEngine.addCourts({ venueId, courtsCount: 1 });
    expect(result.error).toEqual(MUTATION_LOCKED);

    // lockToken is read by the engine's lock check, not declared on addCourts' own params
    const withToken = { venueId, courtsCount: 1, lockToken: 'venue-token' };
    result = tournamentEngine.addCourts(withToken);
    expect(result.success).toEqual(true);

    result = tournamentEngine.addCourts({ venueId: otherVenueId, courtsCount: 1 });
    expect(result.success).toEqual(true);

    // an unknown venueId resolves no venue, so no venue lock applies
    result = tournamentEngine.addCourts({ venueId: 'unknown-venue', courtsCount: 1 });
    expect(result.error).not.toEqual(MUTATION_LOCKED);
  });

  it('getMutationLocks filters by scope', () => {
    mocksEngine.generateTournamentRecord({ setState: true });

    tournamentEngine.addMutationLock({ scope: 'SCHEDULING', lockToken: 'token-1' });
    tournamentEngine.addMutationLock({ scope: 'SCORING', lockToken: 'token-2' });

    const { mutationLocks } = tournamentEngine.getMutationLocks({ scope: 'SCHEDULING' });
    expect(mutationLocks.length).toEqual(1);
    expect(mutationLocks[0].scope).toEqual('SCHEDULING');
  });

  // ─── Expired Lock Cleanup ─────────────────────────────

  it('cleanExpiredMutationLocks removes expired locks', () => {
    mocksEngine.generateTournamentRecord({ setState: true });

    // Create an expired lock
    tournamentEngine.addMutationLock({
      scope: 'SCHEDULING',
      lockToken: 'token-1',
      expiresAt: '2020-01-01T00:00:00.000Z',
    });

    // Verify it was stored (getMutationLocks skips expired, but extension should be present)
    const result = tournamentEngine.cleanExpiredMutationLocks();
    expect(result.success).toEqual(true);
    expect(result.removedCount).toEqual(1);

    // Now add an active lock and verify cleanup doesn't touch it
    tournamentEngine.addMutationLock({
      scope: 'SCORING',
      lockToken: 'token-2',
      expiresAt: '2099-01-01T00:00:00.000Z',
    });

    const result2 = tournamentEngine.cleanExpiredMutationLocks();
    expect(result2.success).toEqual(true);
    expect(result2.removedCount).toEqual(0);

    const { mutationLocks } = tournamentEngine.getMutationLocks();
    expect(mutationLocks.length).toEqual(1);
    expect(mutationLocks[0].scope).toEqual('SCORING');
  });

  // it removes locks, so it is a mutation and lives in `mutate`; the `query` export is a deprecated alias of the same
  // function, kept so existing imports resolve until 8.0.0
  it('cleanExpiredMutationLocks is a tournamentGovernor mutation; the query export is the same function', () => {
    const { mutate, query } = tournamentGovernor as any;
    expect(typeof mutate.cleanExpiredMutationLocks).toEqual('function');
    expect(query.cleanExpiredMutationLocks).toBe(mutate.cleanExpiredMutationLocks);
    expect((tournamentGovernor as any).cleanExpiredMutationLocks).toBe(mutate.cleanExpiredMutationLocks);
  });

  // ─── Lock management methods are never blocked ────────

  it('addMutationLock and removeMutationLock are never blocked by locks', () => {
    mocksEngine.generateTournamentRecord({ setState: true });

    // Lock TOURNAMENT scope
    tournamentEngine.addMutationLock({ scope: 'TOURNAMENT', lockToken: 'token-1' });

    // Adding another lock (different scope) should not be blocked
    const result = tournamentEngine.addMutationLock({ scope: 'SCHEDULING', lockToken: 'token-2' });
    expect(result.success).toEqual(true);

    // Removing a lock should not be blocked
    const removeResult = tournamentEngine.removeMutationLock({ scope: 'SCHEDULING', lockToken: 'token-2' });
    expect(removeResult.success).toEqual(true);
  });
});
