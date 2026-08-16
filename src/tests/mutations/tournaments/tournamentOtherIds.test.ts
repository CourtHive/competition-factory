import { setSubscriptions } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import * as readModel from '@Query/readModel';
import { describe, expect, it } from 'vitest';

// constants and types
import { MODIFY_TOURNAMENT_DETAIL } from '@Constants/topicConstants';
import { UnifiedTournamentID } from '@Types/tournamentTypes';

/**
 * `tournamentOtherIds` was declared on the `Tournament` type with NO write path, no
 * reader, and no read-model column, while the event grain had all three. A record
 * acquired wholesale from an outside system — every `courthive-ingest` adapter produces
 * exactly that — could only record its origin by prefixing its own `tournamentId`, a
 * convention that is not queryable and does not survive a re-id.
 *
 * These cover the whole tier: upsert, wholesale replace, the single-origin invariant, the
 * reader, and the projection.
 */
describe('addTournamentOtherId', () => {
  const utrId: UnifiedTournamentID = {
    uniqueOrganisationName: 'Universal Tennis',
    organisationId: 'UTR',
    tournamentId: '306618',
  };

  function seed() {
    mocksEngine.generateTournamentRecord({ participantsProfile: { nonRandom: 1 }, setState: true });
    return tournamentEngine.getTournament().tournamentRecord;
  }

  it('appends an entry keyed on organisationId, with the ORIGIN organisation id — not ours', () => {
    const record = seed();

    const result: any = tournamentEngine.addTournamentOtherId({
      uniqueOrganisationName: 'Universal Tennis',
      otherTournamentId: '306618',
      organisationId: 'UTR',
    });
    expect(result.success).toEqual(true);

    const { tournamentRecord } = tournamentEngine.getTournament();
    expect(tournamentRecord.tournamentOtherIds).toHaveLength(1);
    const [entry] = tournamentRecord.tournamentOtherIds;
    expect(entry.organisationId).toEqual('UTR');
    expect(entry.uniqueOrganisationName).toEqual('Universal Tennis');
    expect(entry.createdAt).toBeDefined();
    // the whole point of the field: this is THEIR id, and it is not the carrying record's
    expect(entry.tournamentId).toEqual('306618');
    expect(entry.tournamentId).not.toEqual(record.tournamentId);
  });

  it('upserts on organisationId rather than appending a duplicate, and is idempotent', () => {
    seed();

    tournamentEngine.addTournamentOtherId({ organisationId: 'UTR', otherTournamentId: '306618' });
    let result: any = tournamentEngine.addTournamentOtherId({ organisationId: 'UTR', otherTournamentId: '306618' });
    expect(result.success).toEqual(true);

    let { tournamentRecord } = tournamentEngine.getTournament();
    expect(tournamentRecord.tournamentOtherIds).toHaveLength(1);
    expect(tournamentRecord.tournamentOtherIds[0].updatedAt).toBeUndefined(); // no-op did not touch it

    result = tournamentEngine.addTournamentOtherId({ organisationId: 'UTR', otherTournamentId: '999999' });
    expect(result.success).toEqual(true);

    ({ tournamentRecord } = tournamentEngine.getTournament());
    expect(tournamentRecord.tournamentOtherIds).toHaveLength(1);
    expect(tournamentRecord.tournamentOtherIds[0].tournamentId).toEqual('999999');
    expect(tournamentRecord.tournamentOtherIds[0].updatedAt).toBeDefined();
  });

  it('keeps several organisations side by side', () => {
    seed();

    tournamentEngine.addTournamentOtherId({ organisationId: 'UTR', otherTournamentId: '306618', isOrigin: true });
    tournamentEngine.addTournamentOtherId({ organisationId: 'ITA', otherTournamentId: 'ita-4471' });

    const { tournamentRecord } = tournamentEngine.getTournament();
    expect(tournamentRecord.tournamentOtherIds).toHaveLength(2);
    expect(readModel.tournamentOrigin(tournamentRecord)?.organisationId).toEqual('UTR');
  });

  it('REFUSES to move isOrigin to a second organisation — that would silently re-address results', () => {
    seed();

    tournamentEngine.addTournamentOtherId({ organisationId: 'UTR', otherTournamentId: '306618', isOrigin: true });
    const result: any = tournamentEngine.addTournamentOtherId({
      otherTournamentId: 'ita-4471',
      organisationId: 'ITA',
      isOrigin: true,
    });
    expect(result.error).toBeDefined();
    expect(result.info).toContain('UTR');

    const { tournamentRecord } = tournamentEngine.getTournament();
    expect(readModel.tournamentOrigin(tournamentRecord)?.organisationId).toEqual('UTR');
  });

  // The upsert refuses to MOVE isOrigin to a different organisation, but promoting the entry
  // that already holds the slot is the ordinary copy-back case and must work.
  it('promotes an existing entry to origin, and updates a changed organisation name', () => {
    seed();
    tournamentEngine.addTournamentOtherId({ organisationId: 'UTR', otherTournamentId: '306618' });

    let stored = tournamentEngine.getTournament().tournamentRecord.tournamentOtherIds[0];
    expect(stored.isOrigin).toBeUndefined();

    let result: any = tournamentEngine.addTournamentOtherId({
      uniqueOrganisationName: 'Universal Tennis',
      otherTournamentId: '306618',
      organisationId: 'UTR',
      isOrigin: true,
    });
    expect(result.success).toEqual(true);

    stored = tournamentEngine.getTournament().tournamentRecord.tournamentOtherIds[0];
    expect(stored.isOrigin).toEqual(true);
    expect(stored.uniqueOrganisationName).toEqual('Universal Tennis');
    expect(stored.updatedAt).toBeDefined();

    // a name-only change is still a change — it must not be swallowed as a no-op
    result = tournamentEngine.addTournamentOtherId({
      uniqueOrganisationName: 'Universal Tennis (UTR)',
      otherTournamentId: '306618',
      organisationId: 'UTR',
    });
    expect(result.success).toEqual(true);
    stored = tournamentEngine.getTournament().tournamentRecord.tournamentOtherIds[0];
    expect(stored.uniqueOrganisationName).toEqual('Universal Tennis (UTR)');
    expect(stored.isOrigin).toEqual(true); // promotion is not undone by an unrelated update
  });

  it('clearing when nothing is set is a silent no-op rather than an error', () => {
    seed();
    const result: any = tournamentEngine.setTournamentOtherIds({ tournamentOtherIds: null });
    expect(result.success).toEqual(true);
    expect(tournamentEngine.getTournament().tournamentRecord.tournamentOtherIds).toBeUndefined();
  });

  it('requires organisationId and otherTournamentId', () => {
    seed();
    expect(tournamentEngine.addTournamentOtherId({ otherTournamentId: 'x' }).error).toBeDefined();
    expect(tournamentEngine.addTournamentOtherId({ organisationId: 'UTR' }).error).toBeDefined();
  });

  it('fires MODIFY_TOURNAMENT_DETAIL on a real change and stays silent on a no-op', () => {
    seed();

    const notices: any[] = [];
    setSubscriptions({ subscriptions: { [MODIFY_TOURNAMENT_DETAIL]: (n: any[]) => notices.push(...n) } });

    tournamentEngine.addTournamentOtherId({ organisationId: 'UTR', otherTournamentId: '306618' });
    expect(notices.length).toEqual(1);
    expect(notices[0].tournamentOtherIds).toHaveLength(1);

    tournamentEngine.addTournamentOtherId({ organisationId: 'UTR', otherTournamentId: '306618' });
    expect(notices.length).toEqual(1); // idempotent re-apply emitted nothing

    setSubscriptions({ subscriptions: {} });
  });

  it('round-trips a fully-formed entry supplied at record creation', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      participantsProfile: { nonRandom: 1 },
    });
    tournamentRecord.tournamentOtherIds = [{ ...utrId, isOrigin: true }];
    tournamentEngine.setState(tournamentRecord);

    const stored = tournamentEngine.getTournament().tournamentRecord;
    expect(stored.tournamentOtherIds).toEqual([{ ...utrId, isOrigin: true }]);
  });
});

describe('setTournamentOtherIds', () => {
  function seed() {
    mocksEngine.generateTournamentRecord({ participantsProfile: { nonRandom: 1 }, setState: true });
  }

  it('replaces the array wholesale, which is how the origin is re-pointed', () => {
    seed();
    tournamentEngine.addTournamentOtherId({ organisationId: 'UTR', otherTournamentId: '306618', isOrigin: true });

    const result: any = tournamentEngine.setTournamentOtherIds({
      tournamentOtherIds: [{ organisationId: 'ITA', tournamentId: 'ita-4471', isOrigin: true }],
    });
    expect(result.success).toEqual(true);

    const { tournamentRecord } = tournamentEngine.getTournament();
    expect(tournamentRecord.tournamentOtherIds).toHaveLength(1);
    expect(readModel.tournamentOrigin(tournamentRecord)?.organisationId).toEqual('ITA');
  });

  it('clears on null', () => {
    seed();
    tournamentEngine.addTournamentOtherId({ organisationId: 'UTR', otherTournamentId: '306618' });

    const result: any = tournamentEngine.setTournamentOtherIds({ tournamentOtherIds: null });
    expect(result.success).toEqual(true);
    expect(tournamentEngine.getTournament().tournamentRecord.tournamentOtherIds).toBeUndefined();
  });

  it('REJECTS an array carrying two isOrigin entries', () => {
    seed();

    const result: any = tournamentEngine.setTournamentOtherIds({
      tournamentOtherIds: [
        { organisationId: 'UTR', tournamentId: '306618', isOrigin: true },
        { organisationId: 'ITA', tournamentId: 'ita-4471', isOrigin: true },
      ],
    });
    expect(result.error).toBeDefined();
    expect(result.info).toContain('isOrigin');
    expect(tournamentEngine.getTournament().tournamentRecord.tournamentOtherIds).toBeUndefined();
  });

  it('REJECTS an entry with no organisationId — the upsert key', () => {
    seed();

    const result: any = tournamentEngine.setTournamentOtherIds({
      tournamentOtherIds: [{ tournamentId: '306618' } as any],
    });
    expect(result.error).toBeDefined();
    expect(tournamentEngine.getTournament().tournamentRecord.tournamentOtherIds).toBeUndefined();
  });
});

describe('tournamentOrigin + the tournaments read-model row', () => {
  it('projects the flagged entry, independently of the record’s own tournamentId', () => {
    mocksEngine.generateTournamentRecord({ participantsProfile: { nonRandom: 1 }, setState: true });
    tournamentEngine.addTournamentOtherId({ organisationId: 'UTR', otherTournamentId: '306618', isOrigin: true });

    const { tournamentRecord } = tournamentEngine.getTournament();
    const row = readModel.tournamentRow(tournamentRecord);

    expect(row.origin_organisation_id).toEqual('UTR');
    expect(row.origin_tournament_id).toEqual('306618');
    // the distinction the columns exist to preserve
    expect(row.origin_tournament_id).not.toEqual(row.tournament_id);
  });

  // The unit assertions above prove the row BUILDERS project the columns. This proves the
  // whole rebuild path does — cast() is what the server calls, and the CFS incremental
  // producer shares these same builders so both emit byte-identical rows.
  it('survives cast(), at both grains, in one pass', () => {
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }],
      participantsProfile: { nonRandom: 1 },
      setState: true,
    });
    tournamentEngine.addTournamentOtherId({ organisationId: 'UTR', otherTournamentId: '306618', isOrigin: true });
    tournamentEngine.addDrawOtherId({
      otherDrawId: '77f3990b-83c8-4d2b-8bd9-8ca3c646d879',
      otherTournamentId: '306618',
      organisationId: 'UTR',
      isOrigin: true,
      drawId,
    });

    const { rows }: any = tournamentEngine.cast();

    expect(rows.tournaments[0].origin_organisation_id).toEqual('UTR');
    expect(rows.tournaments[0].origin_tournament_id).toEqual('306618');
    expect(rows.draws[0].origin_organisation_id).toEqual('UTR');
    expect(rows.draws[0].origin_draw_id).toEqual('77f3990b-83c8-4d2b-8bd9-8ca3c646d879');
    expect(rows.draws[0].origin_event_id).toBeNull();
    // both origin ids point at UTR's namespace, neither at ours
    expect(rows.tournaments[0].origin_tournament_id).not.toEqual(rows.tournaments[0].tournament_id);
    expect(rows.draws[0].origin_draw_id).not.toEqual(rows.draws[0].draw_id);
  });

  it('is undefined / null when nothing is flagged, so an unflagged entry is never mistaken for an origin', () => {
    expect(
      readModel.tournamentOrigin({ tournamentOtherIds: [{ organisationId: 'UTR', tournamentId: 'x' }] }),
    ).toBeUndefined();
    expect(readModel.tournamentOrigin({})).toBeUndefined();
    expect(readModel.tournamentOrigin(undefined)).toBeUndefined();

    const row = readModel.tournamentRow({
      tournamentId: 't',
      tournamentOtherIds: [{ organisationId: 'UTR', tournamentId: 'x' }],
    });
    expect(row.origin_organisation_id).toBeNull();
    expect(row.origin_tournament_id).toBeNull();
  });
});
