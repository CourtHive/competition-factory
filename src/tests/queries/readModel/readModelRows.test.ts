import {
  entryRows,
  matchUpRowSet,
  rubberTieValue,
  tournamentRow,
  venueRow,
  MatchUpRowContext,
} from '@Query/readModel/readModelRows';
import { expect, it, describe } from 'vitest';

const ctx: MatchUpRowContext = { tournamentId: 't1', providerId: 'PROV', published: false, embargo: null };

describe('tournamentRow', () => {
  it('reads city from tournamentContacts, falling back to record.city', () => {
    expect(tournamentRow({ tournamentId: 't', tournamentContacts: [{ city: 'Brno' }] }).city).toEqual('Brno');
    expect(tournamentRow({ tournamentId: 't', city: 'Prague' }).city).toEqual('Prague');
  });

  it('nulls every optional field on a bare record', () => {
    const row = tournamentRow({ tournamentId: 't' });
    expect(row).toEqual({
      tournament_id: 't',
      tournament_name: null,
      provider_id: null,
      start_date: null,
      end_date: null,
      city: null,
    });
  });
});

describe('venueRow', () => {
  it('falls back name→abbreviation, defaults facility_id to venue_id, null address', () => {
    expect(venueRow({ venueId: 'v', venueAbbreviation: 'VB' })).toEqual({
      venue_id: 'v',
      venue_name: 'VB',
      facility_id: 'v',
      address: null,
    });
  });

  it('joins address parts and honors an explicit facilityId', () => {
    const row = venueRow({
      venueId: 'v',
      venueName: 'Club',
      facilityId: 'F1',
      addresses: [{ addressLine1: '1 St', city: 'C', postalCode: '123' }],
    });
    expect(row.facility_id).toEqual('F1');
    expect(row.address).toEqual('1 St, C, 123');
  });
});

describe('rubberTieValue', () => {
  const tieFormat = {
    collectionDefinitions: [
      { collectionId: 'C1', collectionValue: 1, matchUpCount: 3 }, // split → 1/3
      { collectionId: 'C2', matchUpValue: 2, matchUpCount: 6 }, // explicit per-rubber
      {
        collectionId: 'C3',
        collectionValueProfiles: [{ collectionPosition: 1, matchUpValue: 5 }],
      },
    ],
  };

  it('uses matchUpValue, then a position profile, then collectionValue/matchUpCount', () => {
    expect(rubberTieValue(tieFormat, 'C2', 1)).toEqual(2);
    expect(rubberTieValue(tieFormat, 'C3', 1)).toEqual(5);
    expect(rubberTieValue(tieFormat, 'C1', 1)).toBeCloseTo(1 / 3);
  });

  it('returns null for an unknown/absent collection or tieFormat', () => {
    expect(rubberTieValue(tieFormat, 'NOPE', 1)).toBeNull();
    expect(rubberTieValue(undefined, 'C1', 1)).toBeNull();
    expect(rubberTieValue({ collectionDefinitions: [{ collectionId: 'C1' }] }, 'C1', 1)).toBeNull();
  });
});

describe('matchUpRowSet', () => {
  it('returns nothing for a matchUp with no id', () => {
    expect(matchUpRowSet({}, ctx)).toEqual({ matchUpRows: [], competitorRows: [] });
  });

  it('STANDARD: winner-side-2 score, matchUp-level date/venue, BYE side skipped, side.participantId fallback, real person populated', () => {
    const { matchUpRows, competitorRows } = matchUpRowSet(
      {
        matchUpId: 'm1',
        matchUpType: 'SINGLES',
        winningSide: 2,
        score: { scoreStringSide1: '6-1 6-2', scoreStringSide2: '1-6 2-6' },
        scheduledDate: '2025-02-02',
        venueId: 'vX',
        sides: [
          {
            sideNumber: 1,
            participant: {
              participantId: 'p1',
              participantType: 'INDIVIDUAL',
              participantName: 'A',
              person: { personId: 'UTR999' },
            },
          },
          { sideNumber: 2, participantId: 'p2' }, // no participant object → participantId fallback
          { sideNumber: 3 }, // BYE — no participant and no participantId → no row
        ],
      },
      ctx,
    );
    expect(matchUpRows).toHaveLength(1);
    expect(matchUpRows[0].match_up_level).toEqual('STANDARD');
    expect(matchUpRows[0].score_string).toEqual('1-6 2-6'); // winner (side 2) perspective
    expect(matchUpRows[0].scheduled_date).toEqual('2025-02-02');
    expect(matchUpRows[0].venue_id).toEqual('vX');
    expect(matchUpRows[0].tie_value).toBeNull(); // STANDARD carries no tie weight
    expect(matchUpRows[0].embargo).toBeNull(); // from ctx

    expect(competitorRows).toHaveLength(2); // BYE side produced none
    const c1 = competitorRows.find((c) => c.side_participant_id === 'p1')!;
    expect(c1.person_id).toEqual('UTR999'); // real provider id → populated
    expect(c1.link_source).toEqual('providerId');
    const c2 = competitorRows.find((c) => c.side_participant_id === 'p2')!;
    expect(c2.participant_type).toBeNull();
    expect(c2.individual_participant_id).toEqual('p2');
  });

  it('TEAM: TIE + RUBBER rows, team_id (explicit + participantId fallback), rubber-without-id skipped', () => {
    const { matchUpRows, competitorRows } = matchUpRowSet(
      {
        matchUpId: 'tie1',
        matchUpType: 'TEAM',
        tieFormat: { collectionDefinitions: [{ collectionId: 'COL1', matchUpValue: 3 }] },
        sides: [
          {
            sideNumber: 1,
            participant: {
              participantId: 'team1',
              participantType: 'TEAM',
              teamId: 'TEAM_A',
              participantName: 'Team A',
            },
          },
          {
            sideNumber: 2,
            participant: { participantId: 'team2', participantType: 'TEAM', participantName: 'Team B' },
          }, // no teamId → id fallback
        ],
        tieMatchUps: [
          {
            matchUpId: 'r1',
            collectionId: 'COL1',
            collectionPosition: 1,
            sides: [
              { sideNumber: 1, participant: { participantId: 'p1', participantType: 'INDIVIDUAL' } },
              { sideNumber: 2, participant: { participantId: 'p2', participantType: 'INDIVIDUAL' } },
            ],
          },
          { sides: [] }, // no matchUpId → skipped
        ],
      },
      ctx,
    );
    const levels = matchUpRows.map((m) => m.match_up_level);
    expect(levels).toEqual(['TIE', 'RUBBER']);
    expect(matchUpRows[1].parent_match_up_id).toEqual('tie1');
    expect(matchUpRows[0].tie_value).toBeNull(); // the TIE container carries no weight
    expect(matchUpRows[1].tie_value).toEqual(3); // the RUBBER carries its collection matchUpValue

    const teamRows = competitorRows.filter((c) => c.participant_type === 'TEAM');
    expect(teamRows.find((c) => c.side_participant_id === 'team1')!.team_id).toEqual('TEAM_A');
    expect(teamRows.find((c) => c.side_participant_id === 'team2')!.team_id).toEqual('team2'); // fallback

    // rubber player rows carry the dual's team_id (override from parent side)
    const rubberP1 = competitorRows.find((c) => c.match_up_id === 'r1' && c.side_number === 1)!;
    expect(rubberP1.team_id).toEqual('TEAM_A');
  });

  it('treats a non-TEAM matchUp carrying tieMatchUps as a TIE (Array.isArray branch)', () => {
    const { matchUpRows } = matchUpRowSet({ matchUpId: 'x', tieMatchUps: [], sides: [] }, ctx);
    expect(matchUpRows[0].match_up_level).toEqual('TIE');
  });

  it('emits PAIR rows per individual with the pair as side_participant_id', () => {
    const { competitorRows } = matchUpRowSet(
      {
        matchUpId: 'd1',
        matchUpType: 'DOUBLES',
        sides: [
          {
            sideNumber: 1,
            participant: {
              participantId: 'pair1',
              participantType: 'PAIR',
              individualParticipants: [
                { participantId: 'i1', participantName: 'One', person: { personId: 'i1' } },
                { participantId: 'i2', participantName: 'Two' },
              ],
            },
          },
        ],
      },
      ctx,
    );
    expect(competitorRows).toHaveLength(2);
    expect(competitorRows.map((c) => c.competitor_index)).toEqual([0, 1]);
    expect(competitorRows.every((c) => c.side_participant_id === 'pair1')).toBe(true);
    expect(competitorRows[0].person_id).toBeNull(); // personId === participantId → synthetic
  });
});

describe('entryRows', () => {
  it('returns [] without a tournamentId', () => {
    expect(entryRows({})).toEqual([]);
  });

  it('projects entries, skipping id-less rows, resolving a real person, nulling optional fields', () => {
    const rows = entryRows({
      tournamentId: 't1',
      parentOrganisation: { organisationId: 'PROV' },
      participants: [{ participantId: 'p1', person: { personId: 'UTR7' } }],
      events: [
        {
          entries: [
            { participantId: 'p1', entryStatus: 'ACCEPTED' },
            { participantId: 'p2' }, // no personIndex hit; entry_status null
            { noParticipantId: true }, // skipped
          ],
        },
      ],
    });
    expect(rows).toHaveLength(2);
    const p1 = rows.find((r) => r.participant_id === 'p1')!;
    expect(p1.person_id).toEqual('UTR7');
    expect(p1.provider_id).toEqual('PROV');
    expect(p1.event_id).toBeNull(); // event had no eventId
    const p2 = rows.find((r) => r.participant_id === 'p2')!;
    expect(p2.entry_status).toBeNull();
    expect(p2.person_id).toBeNull();
  });
});
