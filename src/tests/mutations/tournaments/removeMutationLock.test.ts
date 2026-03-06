import { mocksEngine } from '@Assemblies/engines/mock';
import { tournamentEngine } from '@Engines/syncEngine';
import { expect, it, describe } from 'vitest';

import {
  MISSING_TOURNAMENT_RECORD,
  MISSING_VALUE,
  MUTATION_LOCK_NOT_FOUND,
  UNAUTHORIZED_LOCK_OPERATION,
} from '@Constants/errorConditionConstants';
import { removeMutationLock } from '@Mutate/tournaments/mutationLocks/removeMutationLock';

describe('removeMutationLock direct coverage', () => {
  it('returns MISSING_TOURNAMENT_RECORD when no tournamentRecord', () => {
    const result = removeMutationLock({ tournamentRecord: undefined as any });
    expect(result.error).toEqual(MISSING_TOURNAMENT_RECORD);
  });

  it('returns MISSING_VALUE when neither lockId nor scope provided', () => {
    mocksEngine.generateTournamentRecord({ setState: true });
    const { tournamentRecord } = tournamentEngine.getTournament();

    const result = removeMutationLock({ tournamentRecord });
    expect(result.error).toEqual(MISSING_VALUE);
    expect(result.info).toContain('lockId or scope');
  });

  it('removes lock by lockId from tournament-level element', () => {
    mocksEngine.generateTournamentRecord({ setState: true });

    const { lockId } = tournamentEngine.addMutationLock({ scope: 'SCHEDULING', lockToken: 'token-1' });
    expect(lockId).toBeDefined();

    const result = tournamentEngine.removeMutationLock({ lockId, lockToken: 'token-1' });
    expect(result.success).toEqual(true);

    const { mutationLocks } = tournamentEngine.getMutationLocks();
    expect(mutationLocks.length).toEqual(0);
  });

  it('removes lock by scope from tournament-level element', () => {
    mocksEngine.generateTournamentRecord({ setState: true });

    tournamentEngine.addMutationLock({ scope: 'SCORING', lockToken: 'token-1' });
    const result = tournamentEngine.removeMutationLock({ scope: 'SCORING', lockToken: 'token-1' });
    expect(result.success).toEqual(true);
  });

  it('returns UNAUTHORIZED_LOCK_OPERATION with wrong token', () => {
    mocksEngine.generateTournamentRecord({ setState: true });

    const { lockId } = tournamentEngine.addMutationLock({ scope: 'SCHEDULING', lockToken: 'token-1' });
    const result = tournamentEngine.removeMutationLock({ lockId, lockToken: 'wrong-token' });
    expect(result.error).toEqual(UNAUTHORIZED_LOCK_OPERATION);
  });

  it('forceRelease bypasses token check', () => {
    mocksEngine.generateTournamentRecord({ setState: true });

    const { lockId } = tournamentEngine.addMutationLock({ scope: 'SCHEDULING', lockToken: 'token-1' });
    const result = tournamentEngine.removeMutationLock({ lockId, forceRelease: true });
    expect(result.success).toEqual(true);
  });

  it('returns MUTATION_LOCK_NOT_FOUND for non-existent lockId', () => {
    mocksEngine.generateTournamentRecord({ setState: true });

    const result = tournamentEngine.removeMutationLock({ lockId: 'nonexistent-id', lockToken: 'token-1' });
    expect(result.error).toEqual(MUTATION_LOCK_NOT_FOUND);
  });

  it('returns MUTATION_LOCK_NOT_FOUND for non-existent scope', () => {
    mocksEngine.generateTournamentRecord({ setState: true });

    const result = tournamentEngine.removeMutationLock({ scope: 'SCHEDULING', lockToken: 'token-1' });
    expect(result.error).toEqual(MUTATION_LOCK_NOT_FOUND);
  });

  it('removes lock from draw-level element', () => {
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }],
      setState: true,
    });

    const { lockId } = tournamentEngine.addMutationLock({
      scope: 'SCORING',
      lockToken: 'draw-token',
      drawId,
    });
    expect(lockId).toBeDefined();

    const result = tournamentEngine.removeMutationLock({ lockId, lockToken: 'draw-token', drawId });
    expect(result.success).toEqual(true);
  });

  it('removes lock from event-level element', () => {
    const {
      eventIds: [eventId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }],
      setState: true,
    });

    const { lockId } = tournamentEngine.addMutationLock({
      scope: 'SCORING',
      lockToken: 'event-token',
      eventId,
    });
    expect(lockId).toBeDefined();

    const result = tournamentEngine.removeMutationLock({ lockId, lockToken: 'event-token', eventId });
    expect(result.success).toEqual(true);
  });

  it('removes lock from venue-level element', () => {
    mocksEngine.generateTournamentRecord({ setState: true });

    const venue = { venueName: 'Test Venue' };
    const addVenueResult = tournamentEngine.addVenue({ venue });
    expect(addVenueResult.success).toEqual(true);
    const venueId = addVenueResult.venue.venueId;

    const { lockId } = tournamentEngine.addMutationLock({
      scope: 'SCHEDULING',
      lockToken: 'venue-token',
      venueId,
    });
    expect(lockId).toBeDefined();

    const result = tournamentEngine.removeMutationLock({ lockId, lockToken: 'venue-token', venueId });
    expect(result.success).toEqual(true);
  });
});
