import mocksEngine from '@Assemblies/engines/mock';
import { expect, it, describe } from 'vitest';
import { cast } from '@Query/readModel/cast';

// constants
import { MISSING_TOURNAMENT_RECORD } from '@Constants/errorConditionConstants';

describe('cast — singles (STANDARD)', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    tournamentAttributes: { tournamentId: 't1' },
    startDate: '2025-01-01',
    endDate: '2025-01-07',
    drawProfiles: [{ drawSize: 8, eventName: 'Singles' }],
    completeAllMatchUps: true,
    nonRandom: 1,
  });

  it('projects one tournaments row with provider + dates', () => {
    const { rows } = cast({ tournamentRecord });
    expect(rows!.tournaments).toHaveLength(1);
    expect(rows!.tournaments[0].tournament_id).toEqual('t1');
    expect(rows!.tournaments[0].start_date).toEqual('2025-01-01');
    expect(rows!.tournaments[0].end_date).toEqual('2025-01-07');
  });

  it('flattens every matchUp at STANDARD level, one competitor per assigned side', () => {
    const { rows } = cast({ tournamentRecord });
    expect(rows!.match_ups.length).toBeGreaterThan(0);
    expect(rows!.match_ups.every((m) => m.match_up_level === 'STANDARD')).toBe(true);
    expect(rows!.match_ups.every((m) => m.parent_match_up_id === null)).toBe(true);

    // singles competitors: index 0, INDIVIDUAL, side id === individual id
    expect(rows!.match_up_competitors.length).toBeGreaterThan(0);
    expect(rows!.match_up_competitors.every((c) => c.competitor_index === 0)).toBe(true);
    expect(rows!.match_up_competitors.every((c) => c.participant_type === 'INDIVIDUAL')).toBe(true);
    expect(rows!.match_up_competitors.every((c) => c.side_participant_id === c.individual_participant_id)).toBe(true);
  });

  it('writes a winner-perspective score_string on completed matchUps', () => {
    const { rows } = cast({ tournamentRecord });
    const completed = rows!.match_ups.filter((m) => m.winning_side && m.match_up_status === 'COMPLETED');
    expect(completed.length).toBeGreaterThan(0);
    expect(completed.every((m) => typeof m.score_string === 'string' && m.score_string.length > 0)).toBe(true);
  });

  it('leaves person_id NULL / unresolved for synthetic (UUID) participants', () => {
    const { rows } = cast({ tournamentRecord });
    expect(rows!.match_up_competitors.every((c) => c.person_id === null && c.link_source === 'unresolved')).toBe(true);
  });
});

describe('cast — doubles (per-individual PAIR grain)', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8, eventType: 'DOUBLES', eventName: 'Dubs' }],
    nonRandom: 1,
  });

  it('emits two individual rows per assigned side with the pair as side_participant_id', () => {
    const { rows } = cast({ tournamentRecord });
    const pairRows = rows!.match_up_competitors.filter((c) => c.participant_type === 'PAIR');
    expect(pairRows.length).toBeGreaterThan(0);

    const indices = new Set(pairRows.map((c) => c.competitor_index));
    expect(indices.has(0)).toBe(true);
    expect(indices.has(1)).toBe(true);

    // the side (pair) id is distinct from each human's individual id
    const second = pairRows.find((c) => c.competitor_index === 1)!;
    expect(second.side_participant_id).toBeTruthy();
    expect(second.individual_participant_id).toBeTruthy();
    expect(second.side_participant_id).not.toEqual(second.individual_participant_id);
    expect(rows!.match_ups.every((m) => m.event_type === 'DOUBLES')).toBe(true);
  });
});

describe('cast — team (TIE container + RUBBER nesting)', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4, eventType: 'TEAM', tieFormatName: 'COLLEGE_DEFAULT', eventName: 'Teams' }],
    nonRandom: 1,
  });

  it('produces TIE + RUBBER levels, rubbers parented, team rows carry team_id', () => {
    const { rows } = cast({ tournamentRecord });
    const levels = new Set(rows!.match_ups.map((m) => m.match_up_level));
    expect(levels.has('TIE')).toBe(true);
    expect(levels.has('RUBBER')).toBe(true);

    const rubbers = rows!.match_ups.filter((m) => m.match_up_level === 'RUBBER');
    expect(rubbers.length).toBeGreaterThan(0);
    expect(rubbers.every((r) => typeof r.parent_match_up_id === 'string')).toBe(true);

    const teamRows = rows!.match_up_competitors.filter((c) => c.participant_type === 'TEAM');
    expect(teamRows.length).toBeGreaterThan(0);
    expect(teamRows.every((c) => typeof c.team_id === 'string')).toBe(true);
    // TEAM competitor rows are not resolved to a person
    expect(teamRows.every((c) => c.person_id === null)).toBe(true);
  });
});

describe('cast — entries fact', () => {
  it('projects an entries row per event entry', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      tournamentAttributes: { tournamentId: 'te' },
      drawProfiles: [{ drawSize: 8, eventName: 'E1' }],
      nonRandom: 1,
    });
    const { rows } = cast({ tournamentRecord });
    expect(rows!.entries.length).toBeGreaterThan(0);
    expect(rows!.entries.every((e) => e.tournament_id === 'te' && e.participant_id)).toBe(true);
    // entry event_id resolves to the generated event
    const eventId = tournamentRecord.events![0].eventId;
    expect(rows!.entries.some((e) => e.event_id === eventId)).toBe(true);
  });
});

describe('cast — venues + facility_id default', () => {
  it('projects venues and links, facility_id defaulting to venue_id', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      tournamentAttributes: { tournamentId: 'tv' },
      drawProfiles: [{ drawSize: 4 }],
      venueProfiles: [{ venueId: 'v1', venueName: 'Club', courtsCount: 2, idPrefix: 'v1c' }],
      nonRandom: 1,
    });
    const { rows } = cast({ tournamentRecord });
    expect(rows!.venues).toHaveLength(1);
    expect(rows!.venues[0].venue_id).toEqual('v1');
    expect(rows!.venues[0].venue_name).toEqual('Club');
    expect(rows!.venues[0].facility_id).toEqual('v1');
    expect(rows!.tournament_venues).toEqual([{ tournament_id: 'tv', venue_id: 'v1' }]);
  });

  it('uses an explicit facilityId when the venue carries one', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }],
      venueProfiles: [{ venueId: 'v1', venueName: 'Club', courtsCount: 2, idPrefix: 'v1c' }],
      nonRandom: 1,
    });
    tournamentRecord.venues![0].facilityId = 'fac-9';
    const { rows } = cast({ tournamentRecord });
    expect(rows!.venues[0].facility_id).toEqual('fac-9');
  });
});

describe('cast — published flag (visibility, not omission)', () => {
  it('is false for an unpublished draw', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8 }],
      nonRandom: 1,
    });
    const { rows } = cast({ tournamentRecord });
    expect(rows!.match_ups.length).toBeGreaterThan(0);
    expect(rows!.match_ups.every((m) => m.published === false)).toBe(true);
  });

  it('is true for a published draw (and still projects every matchUp)', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8, publish: true }],
      completeAllMatchUps: true,
      nonRandom: 1,
    });
    const { rows } = cast({ tournamentRecord });
    expect(rows!.match_ups.length).toBeGreaterThan(0);
    expect(rows!.match_ups.every((m) => m.published === true)).toBe(true);
  });
});

describe('cast — guard', () => {
  it('errors (no throw) when tournamentRecord is missing', () => {
    const result = cast({});
    expect(result.error).toEqual(MISSING_TOURNAMENT_RECORD);
    expect(result.rows).toBeUndefined();
  });

  it('errors (no throw) when called with no arguments', () => {
    const result = cast(undefined);
    expect(result.error).toEqual(MISSING_TOURNAMENT_RECORD);
  });
});
