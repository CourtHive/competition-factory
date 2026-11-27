import { tieFormats } from '@Fixtures/scoring/tieFormats';
import { mocksEngine } from '@Assemblies/engines/mock';
import { describe, expect, it } from 'vitest';

// constants
import { TEAM } from '@Constants/eventConstants';

/**
 * A tieFormat a mocks profile carries belongs to the caller. The generator reads it and builds the record from it; it
 * never writes to it. It used to mint the missing collectionIds onto the caller's own collectionDefinitions while it
 * counted the team members a profile needs, so a published fixture handed to it (`fixtures.tieFormats.*`, which
 * carries no collectionIds) left the generator holding ids, and every later record built from that fixture shared
 * them. The record still gets its collectionIds: the engine mints them when the tieFormat is attached.
 */
const deepFreeze = <T>(value: T): T => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
};

const profiles: Record<string, (tieFormat: any) => any> = {
  drawProfiles: (tieFormat) => ({ drawProfiles: [{ drawSize: 4, eventType: TEAM, tieFormat }] }),
  'drawProfiles, setState': (tieFormat) => ({
    drawProfiles: [{ drawSize: 4, eventType: TEAM, tieFormat }],
    setState: true,
  }),
  'drawProfiles, completeAllMatchUps': (tieFormat) => ({
    drawProfiles: [{ drawSize: 4, eventType: TEAM, tieFormat }],
    completeAllMatchUps: true,
  }),
  eventProfiles: (tieFormat) => ({ eventProfiles: [{ eventType: TEAM, tieFormat, drawProfiles: [{ drawSize: 4 }] }] }),
  leagueProfiles: (tieFormat) => ({ leagueProfiles: [{ teamsCount: 4, tieFormat }] }),
};

const collectionIdsOf = (tournamentRecord: any) =>
  tournamentRecord.events.flatMap((event: any) =>
    event.tieFormat.collectionDefinitions.map(({ collectionId }: any) => collectionId),
  );

const linesOf = (tournamentRecord: any) =>
  tournamentRecord.events.flatMap((event: any) =>
    (event.drawDefinitions ?? []).flatMap((drawDefinition: any) =>
      drawDefinition.structures.flatMap((structure: any) =>
        (structure.matchUps ?? []).flatMap((matchUp: any) => matchUp.tieMatchUps ?? []),
      ),
    ),
  );

describe('a mocks profile tieFormat is read, not written', () => {
  for (const [name, profile] of Object.entries(profiles)) {
    it(`${name}: a frozen fixture builds a record whose collections and lines carry collectionIds`, () => {
      const tieFormat = deepFreeze(structuredClone(tieFormats.COLLEGE_DEFAULT));
      const { tournamentRecord, error } = mocksEngine.generateTournamentRecord(profile(tieFormat));
      expect(error).toBeUndefined();

      const collectionIds = collectionIdsOf(tournamentRecord);
      expect(collectionIds.length).toBeGreaterThan(0);
      expect(collectionIds.every(Boolean)).toEqual(true);

      const lines = linesOf(tournamentRecord);
      expect(lines.length).toBeGreaterThan(0);
      expect(lines.every(({ collectionId }) => collectionIds.includes(collectionId))).toEqual(true);
    });
  }

  it('two records built from one tieFormat object do not share collectionIds, and the object is unchanged', () => {
    const tieFormat = structuredClone(tieFormats.COLLEGE_DEFAULT);
    const given = structuredClone(tieFormat);

    const first = mocksEngine.generateTournamentRecord(profiles.drawProfiles(tieFormat)).tournamentRecord;
    const second = mocksEngine.generateTournamentRecord(profiles.drawProfiles(tieFormat)).tournamentRecord;

    expect(tieFormat).toEqual(given);
    const firstIds = collectionIdsOf(first);
    expect(collectionIdsOf(second).some((collectionId) => firstIds.includes(collectionId))).toEqual(false);
  });

  it('the published fixture carries no collectionIds after a record is built from it', () => {
    mocksEngine.generateTournamentRecord(profiles.drawProfiles(tieFormats.COLLEGE_DEFAULT));
    expect(
      (tieFormats.COLLEGE_DEFAULT as any).collectionDefinitions.every(({ collectionId }) => collectionId === undefined),
    ).toEqual(true);
  });
});
