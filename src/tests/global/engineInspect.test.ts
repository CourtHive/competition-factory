import { describe, expect, it } from 'vitest';

import {
  setAuditAuthorityServer,
  setSaveDrawDeletions,
  setSchemaWriteMode,
  setSubscriptions,
} from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';

// constants and types
import { LEGACY, NATIVE } from '@Constants/schemaWriteModeConstants';
import { AUDIT, MODIFY_MATCHUP } from '@Constants/topicConstants';

describe('engine.inspect — live state snapshot', () => {
  it('reports the factory version + write-mode flags', () => {
    tournamentEngine.reset();
    setSchemaWriteMode(NATIVE);
    setSaveDrawDeletions(false);
    setAuditAuthorityServer(false);

    const snap = tournamentEngine.inspect();
    expect(typeof snap.version).toEqual('string');
    expect(snap.version.length).toBeGreaterThan(0);
    expect(snap.schemaWriteMode).toEqual(NATIVE);
    expect(snap.saveDrawDeletions).toEqual(false);
    expect(snap.auditAuthorityServer).toEqual(false);
  });

  it('reflects schemaWriteMode flips immediately', () => {
    setSchemaWriteMode(LEGACY);
    expect(tournamentEngine.inspect().schemaWriteMode).toEqual(LEGACY);
    setSchemaWriteMode(NATIVE);
    expect(tournamentEngine.inspect().schemaWriteMode).toEqual(NATIVE);
    setSchemaWriteMode(LEGACY);
  });

  it('reports empty loaded state when nothing is set', () => {
    tournamentEngine.reset();
    const snap = tournamentEngine.inspect();
    expect(snap.loaded.tournamentIds).toEqual([]);
    expect(snap.loaded.currentTournamentId).toBeUndefined();
    expect(snap.loaded.counts.tournaments).toEqual(0);
    expect(snap.loaded.counts.events).toEqual(0);
    expect(snap.loaded.counts.drawDefinitions).toEqual(0);
    expect(snap.loaded.counts.matchUps).toEqual(0);
    expect(snap.loaded.counts.participants).toEqual(0);
  });

  it('counts loaded records correctly', () => {
    const result = mocksEngine.generateTournamentRecord({
      inContext: true,
      setState: true,
      drawProfiles: [{ participantsCount: 8, drawSize: 8 }],
      venueProfiles: [{ courtsCount: 4 }],
    });

    const snap = tournamentEngine.inspect();
    expect(snap.loaded.tournamentIds).toContain(result.tournamentRecord.tournamentId);
    expect(snap.loaded.currentTournamentId).toEqual(result.tournamentRecord.tournamentId);
    expect(snap.loaded.counts.tournaments).toEqual(1);
    expect(snap.loaded.counts.events).toBeGreaterThanOrEqual(1);
    expect(snap.loaded.counts.drawDefinitions).toBeGreaterThanOrEqual(1);
    expect(snap.loaded.counts.matchUps).toBeGreaterThan(0);
    expect(snap.loaded.counts.participants).toBeGreaterThan(0);
    expect(snap.loaded.counts.venues).toEqual(1);
    expect(snap.loaded.counts.courts).toEqual(4);
  });

  it('reports subscribed topics', () => {
    setSubscriptions({
      subscriptions: {
        [AUDIT]: () => {},
        [MODIFY_MATCHUP]: () => {},
      },
    });
    const snap = tournamentEngine.inspect();
    expect(snap.subscriptions.topics).toContain(AUDIT);
    expect(snap.subscriptions.topics).toContain(MODIFY_MATCHUP);
    // cleanup
    setSubscriptions({ subscriptions: { [AUDIT]: true, [MODIFY_MATCHUP]: true } });
  });

  it('returns the current devContext (false by default)', () => {
    const snap = tournamentEngine.inspect();
    expect(snap.devContext).toBeDefined();
    // devContext is `false` by default (DevContextType union)
    expect(snap.devContext === false || typeof snap.devContext === 'object').toEqual(true);
  });

  it('multiple loaded tournaments are all counted', () => {
    tournamentEngine.reset();
    const a = mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 4 }] });
    const b = mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 4 }] });
    tournamentEngine.setTournamentRecord(a.tournamentRecord);
    tournamentEngine.setTournamentRecord(b.tournamentRecord);

    const snap = tournamentEngine.inspect();
    expect(snap.loaded.tournamentIds.length).toEqual(2);
    expect(snap.loaded.counts.tournaments).toEqual(2);
    expect(snap.loaded.counts.events).toBeGreaterThanOrEqual(2);
  });

  // Skeleton records exercise the optional-chain fallback branches in
  // countLoadedRecords — `record?.events ?? []`, `event?.drawDefinitions ?? []`,
  // `dd?.structures ?? []`, `record?.venues ?? []`.
  it('handles partial records with missing collections (0 counts, no throw)', () => {
    tournamentEngine.reset();
    tournamentEngine.setTournamentRecord({ tournamentId: 'skeleton-1' } as any);

    const snap = tournamentEngine.inspect();
    expect(snap.loaded.counts.tournaments).toEqual(1);
    expect(snap.loaded.counts.events).toEqual(0);
    expect(snap.loaded.counts.drawDefinitions).toEqual(0);
    expect(snap.loaded.counts.structures).toEqual(0);
    expect(snap.loaded.counts.matchUps).toEqual(0);
    expect(snap.loaded.counts.participants).toEqual(0);
    expect(snap.loaded.counts.venues).toEqual(0);
    expect(snap.loaded.counts.courts).toEqual(0);
  });

  it('records with events but no drawDefinitions still count tournaments + events', () => {
    tournamentEngine.reset();
    tournamentEngine.setTournamentRecord({
      tournamentId: 'events-only',
      events: [{ eventId: 'e1' }, { eventId: 'e2' }],
      venues: [{ venueId: 'v1' }],
    } as any);

    const snap = tournamentEngine.inspect();
    expect(snap.loaded.counts.events).toEqual(2);
    expect(snap.loaded.counts.drawDefinitions).toEqual(0);
    expect(snap.loaded.counts.venues).toEqual(1);
    expect(snap.loaded.counts.courts).toEqual(0);
  });
});
