import { buildMatchUps, type CorpusResult } from '../standings/standingsFixtures';
import { getSeasonStandings } from '@Query/season/getSeasonStandings';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants and types
import { POLICY_ROUND_ROBIN_TALLY_DEFAULT } from '@Fixtures/policies/POLICY_ROUND_ROBIN_TALLY_DEFAULT';
import { POLICY_TYPE_ROUND_ROBIN_TALLY } from '@Constants/policyConstants';
import { STANDINGS_PURPOSE_MOVEMENT, SUBJECT_PERSON } from '@Constants/seasonConstants';
import type { Season } from '@Types/seasonTypes';

/**
 * Season standings on the standings engine (Mentat `planning/STANDINGS_ENGINE_SPEC.md` § 7, S2). Every expected order
 * is worked by hand from the results below.
 *
 *   P1: A beat B 6-4 6-4; B beat C 6-0 6-0
 *   P2: C beat A 6-0 6-0; A beat D 6-4 6-4; B beat D 6-0 6-0; C v D unplayed
 *
 *   A: 2 wins (B, D), sets 4-2, games 24-28     B: 2 wins (C, D), sets 4-2, games 32-8
 *   C: 1 win, D: 0 wins (games 8), E: placed, never played
 *
 * A and B are level on wins and sets. Flat ranking (matchUpsWon, valueWon, setsWon, gamesWon) puts B first on games;
 * the engine settles the pair by head-to-head, and their only meeting was in P1, a different record from P2's.
 */

const DEFAULT_POLICY = POLICY_ROUND_ROBIN_TALLY_DEFAULT[POLICY_TYPE_ROUND_ROBIN_TALLY];

/** each period is its own record: the same person plays as a different participantId in each */
function periodMatchUps(tournamentId: string, results: CorpusResult[]) {
  return buildMatchUps({ results }).map((matchUp) => ({
    ...matchUp,
    matchUpId: `${tournamentId}-${matchUp.matchUpId}`,
    drawId: `${tournamentId}-draw`,
    eventId: `${tournamentId}-event`,
    tournamentId,
    sides: matchUp.sides?.map((side) => {
      const letter = side.participantId as string;
      const participantId = `${tournamentId}-${letter}`;
      const person = letter === 'X' ? undefined : { personId: letter };
      return { ...side, participantId, participant: { participantId, participantType: 'INDIVIDUAL', person } };
    }),
  })) as any[];
}

const P1 = periodMatchUps('P1', [
  { sides: ['A', 'B'], score: '6-4 6-4', winningSide: 1 },
  { sides: ['B', 'C'], score: '6-0 6-0', winningSide: 1 },
]);
const P2 = periodMatchUps('P2', [
  { sides: ['C', 'A'], score: '6-0 6-0', winningSide: 1 },
  { sides: ['A', 'D'], score: '6-4 6-4', winningSide: 1 },
  { sides: ['B', 'D'], score: '6-0 6-0', winningSide: 1 },
  { sides: ['C', 'D'] },
]);
const MATCH_UPS = [...P1, ...P2];

function season(overrides: Partial<Season> = {}, tierPolicy?: any): Season {
  const subjects = ['A', 'B', 'C', 'D', 'E'].map((subjectId) => ({ subjectType: SUBJECT_PERSON, subjectId }));
  return {
    seasonId: 'S',
    seriesId: 'SERIES',
    name: 'Season',
    startDate: '2026-01-01',
    status: 'ACTIVE',
    tiers: [{ tierId: 'T', tier: { system: 'MOCK', value: 'T' }, ...(tierPolicy && { tallyPolicy: tierPolicy }) }],
    periods: ['P1', 'P2'].map((periodId, index) => ({
      periodId,
      periodNumber: index + 1,
      includeInStandings: true,
      competitions: [{ tierId: 'T', tournamentId: periodId }],
      placements: [{ tierId: 'T', subjects }],
    })),
    ...overrides,
  } as Season;
}

const order = (result: any) => result.standings.T.map(({ subject, rank }) => `${subject.subjectId}${rank}`);

describe('season standings on the standings engine', () => {
  it('without a policy, ranks flat as before: B ahead of A on games', () => {
    let result: any = getSeasonStandings({ season: season(), matchUps: MATCH_UPS });
    expect(result.error).toBeUndefined();
    expect(order(result)).toEqual(['B1', 'A2', 'C3', 'D4', 'E5']);
  });

  it('with a season policy, head-to-head reaches across periods and records: A ahead of B', () => {
    let result: any = getSeasonStandings({ season: season({ tallyPolicy: DEFAULT_POLICY }), matchUps: MATCH_UPS });
    expect(result.error).toBeUndefined();
    expect(order(result)).toEqual(['A1', 'B2', 'C3', 'D4', 'E5']);
    const a = result.standings.T[0];
    expect(a).toMatchObject({ matchUpsWon: 2, setsWon: 4, setsLost: 2, gamesWon: 24, gamesLost: 28 });
    expect(a.participantIds).toEqual(['P1-A', 'P2-A']);
  });

  it('reports a tier as provisional while a referenced matchUp has no result', () => {
    let result: any = getSeasonStandings({ season: season({ tallyPolicy: DEFAULT_POLICY }), matchUps: MATCH_UPS });
    expect(result.provisional).toEqual({ T: true });
    result = getSeasonStandings({ season: season({ tallyPolicy: DEFAULT_POLICY }), matchUps: P1 });
    expect(result.provisional).toEqual({ T: false });
  });

  it("a tier's policy overrides the season's", () => {
    const gamesFirst = {
      ...DEFAULT_POLICY,
      headToHead: { disabled: true },
      tallyDirectives: [{ attribute: 'gamesWon' }],
    };
    let result: any = getSeasonStandings({
      season: season({ tallyPolicy: DEFAULT_POLICY }, gamesFirst),
      matchUps: MATCH_UPS,
    });
    expect(order(result)).toEqual(['B1', 'A2', 'C3', 'D4', 'E5']);
  });

  it('an explicit orderBy asks for the flat order even when a policy is declared', () => {
    let result: any = getSeasonStandings({
      season: season({ tallyPolicy: DEFAULT_POLICY }),
      orderBy: ['matchUpsWon', 'gamesWon'],
      matchUps: MATCH_UPS,
    });
    expect(order(result)).toEqual(['B1', 'A2', 'C3', 'D4', 'E5']);
  });

  it('an unmapped opponent still credits the result to the other side and never becomes a row', () => {
    const unmapped = periodMatchUps('P2', [{ sides: ['D', 'X'], score: '6-1 6-1', winningSide: 1 }]).map((matchUp) => ({
      ...matchUp,
      matchUpId: 'P2-extra',
    }));
    let result: any = getSeasonStandings({
      season: season({ tallyPolicy: DEFAULT_POLICY }),
      matchUps: [...MATCH_UPS, ...unmapped],
    });
    expect(result.unmapped).toEqual([{ participantId: 'P2-X', tierId: 'T', tournamentId: 'P2' }]);
    const d = result.standings.T.find(({ subject }) => subject.subjectId === 'D');
    expect(d).toMatchObject({ matchUpsWon: 1, matchUpsLost: 2 });
    expect(result.standings.T.map(({ subject }) => subject.subjectId)).not.toContain('X');
  });
});

describe('season standings ranked by the tie-score value', () => {
  it('a policy may make valueWon the primary measure', () => {
    const { season: generated, tournamentRecords }: any = mocksEngine.generateSeason({
      seasonProfile: {
        tiers: [{ tierId: 'A1', tierValue: 'A-1', teamsCount: 4 }],
        tieFormatName: 'DOMINANT_DUO',
        periods: [{}],
        seasonName: 'Value',
      },
    });
    const matchUps = Object.values(tournamentRecords).flatMap((tournamentRecord: any) => {
      tournamentEngine.setState(tournamentRecord);
      return tournamentEngine.allTournamentMatchUps().matchUps;
    });
    generated.tallyPolicy = { groupOrderKey: 'valueWon', headToHead: { disabled: true }, tallyDirectives: [] };
    let result: any = getSeasonStandings({ season: generated, matchUps });
    expect(result.error).toBeUndefined();
    const rows = result.standings.A1;
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].valueWon).toBeLessThanOrEqual(rows[i - 1].valueWon);
      // equal values share a rank, a lower value takes a lower one
      if (rows[i].valueWon === rows[i - 1].valueWon) expect(rows[i].rank).toBe(rows[i - 1].rank);
      else expect(rows[i].rank).toBeGreaterThan(rows[i - 1].rank);
    }
  });
});

describe('a directive that applies only for a purpose (A8)', () => {
  it('gamesWon breaks the A, B tie only for the movement table', () => {
    const tallyPolicy = {
      headToHead: { disabled: true },
      tallyDirectives: [{ attribute: 'gamesWon', when: { purposes: [STANDINGS_PURPOSE_MOVEMENT] } }],
    };
    // published table: nothing else separates A and B (wins and sets level), so they share first place
    let result: any = getSeasonStandings({ season: season({ tallyPolicy }), matchUps: MATCH_UPS });
    expect(order(result).slice(0, 2)).toEqual(['A1', 'B1']);
    // the movement table: B's 32 games to A's 24
    result = getSeasonStandings({
      season: season({ tallyPolicy }),
      matchUps: MATCH_UPS,
      purpose: STANDINGS_PURPOSE_MOVEMENT,
    });
    expect(order(result).slice(0, 2)).toEqual(['B1', 'A2']);
  });
});
