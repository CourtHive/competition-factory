import { afterEach, describe, expect, it } from 'vitest';

import { setSchemaWriteMode } from '@Global/state/globalState';
import competitionEngine from '@Engines/syncEngine';
import { findExtension } from '@Acquire/findExtension';
import mocksEngine from '@Assemblies/engines/mock';

// constants and types
import { BRIDGE, LEGACY, NATIVE } from '@Constants/schemaWriteModeConstants';
import { LINKED_TOURNAMENTS } from '@Constants/extensionConstants';

function loadTwoTournaments() {
  competitionEngine.reset();
  const a = mocksEngine.generateTournamentRecord();
  const b = mocksEngine.generateTournamentRecord();
  competitionEngine.setTournamentRecord(a.tournamentRecord);
  competitionEngine.setTournamentRecord(b.tournamentRecord);
  return {
    tournamentIdA: a.tournamentRecord.tournamentId,
    tournamentIdB: b.tournamentRecord.tournamentId,
  };
}

function getRecord(tournamentId: string) {
  return competitionEngine.getTournament({ tournamentId })?.tournamentRecord;
}

afterEach(() => {
  // setupFile pins LEGACY; restore in case a test changed it
  setSchemaWriteMode(LEGACY);
  competitionEngine.reset();
});

describe('linkedTournamentIds — schemaWriteMode shadow writes', () => {
  it('NATIVE mode writes flat first-class and clears any legacy extension', () => {
    setSchemaWriteMode(NATIVE);
    const { tournamentIdA, tournamentIdB } = loadTwoTournaments();

    competitionEngine.linkTournaments();

    const recordA: any = getRecord(tournamentIdA);
    const recordB: any = getRecord(tournamentIdB);

    expect(Array.isArray(recordA.linkedTournamentIds)).toEqual(true);
    expect(recordA.linkedTournamentIds).toContain(tournamentIdA);
    expect(recordA.linkedTournamentIds).toContain(tournamentIdB);
    expect(recordB.linkedTournamentIds).toContain(tournamentIdA);

    // Legacy extension must not be present in NATIVE-only writes.
    expect(findExtension({ element: recordA, name: LINKED_TOURNAMENTS }).extension).toBeUndefined();
    expect(findExtension({ element: recordB, name: LINKED_TOURNAMENTS }).extension).toBeUndefined();
  });

  it('LEGACY mode writes the wrapper extension and clears any first-class field', () => {
    setSchemaWriteMode(LEGACY);
    const { tournamentIdA } = loadTwoTournaments();

    competitionEngine.linkTournaments();

    const recordA: any = getRecord(tournamentIdA);
    expect(recordA.linkedTournamentIds).toBeUndefined();

    const { extension } = findExtension({ element: recordA, name: LINKED_TOURNAMENTS });
    expect(extension?.value?.tournamentIds).toBeDefined();
    expect(extension?.value?.tournamentIds.length).toEqual(2);
  });

  it('BRIDGE mode writes both surfaces', () => {
    setSchemaWriteMode(BRIDGE);
    const { tournamentIdA } = loadTwoTournaments();

    competitionEngine.linkTournaments();

    const recordA: any = getRecord(tournamentIdA);
    expect(Array.isArray(recordA.linkedTournamentIds)).toEqual(true);
    expect(recordA.linkedTournamentIds.length).toEqual(2);

    const { extension } = findExtension({ element: recordA, name: LINKED_TOURNAMENTS });
    expect(extension?.value?.tournamentIds.length).toEqual(2);
  });

  it('getLinkedTournamentIds reads NATIVE-written records correctly', () => {
    setSchemaWriteMode(NATIVE);
    const { tournamentIdA, tournamentIdB } = loadTwoTournaments();
    competitionEngine.linkTournaments();

    const { linkedTournamentIds } = competitionEngine.getLinkedTournamentIds();
    // returns map: for each tournament, its OTHER linked ids
    expect(linkedTournamentIds[tournamentIdA]).toEqual([tournamentIdB]);
    expect(linkedTournamentIds[tournamentIdB]).toEqual([tournamentIdA]);
  });

  it('unlinkTournament removes the id from both surfaces (BRIDGE)', () => {
    setSchemaWriteMode(BRIDGE);
    const { tournamentIdA, tournamentIdB } = loadTwoTournaments();
    const { tournamentRecord: c } = mocksEngine.generateTournamentRecord();
    competitionEngine.setTournamentRecord(c);
    const tournamentIdC = c.tournamentId;

    competitionEngine.linkTournaments();
    competitionEngine.unlinkTournament({ tournamentId: tournamentIdC });

    const recordA: any = getRecord(tournamentIdA);
    const recordB: any = getRecord(tournamentIdB);

    expect(recordA.linkedTournamentIds).not.toContain(tournamentIdC);
    expect(recordB.linkedTournamentIds).not.toContain(tournamentIdC);
    expect(recordA.linkedTournamentIds).toContain(tournamentIdB);

    // Legacy surface also reflects the removal.
    const extA = findExtension({ element: recordA, name: LINKED_TOURNAMENTS }).extension;
    expect(extA?.value?.tournamentIds).not.toContain(tournamentIdC);
  });

  it('unlinkTournaments clears both surfaces', () => {
    setSchemaWriteMode(BRIDGE);
    const { tournamentIdA } = loadTwoTournaments();
    competitionEngine.linkTournaments();
    competitionEngine.unlinkTournaments();

    const recordA: any = getRecord(tournamentIdA);
    expect(recordA.linkedTournamentIds).toBeUndefined();
    expect(findExtension({ element: recordA, name: LINKED_TOURNAMENTS }).extension).toBeUndefined();
  });
});
