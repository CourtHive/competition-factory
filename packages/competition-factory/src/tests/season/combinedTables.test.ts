import { buildMatchUps, type CorpusResult } from '../standings/standingsFixtures';
import { getSeasonStandings } from '@Query/season/getSeasonStandings';
import { describe, expect, it } from 'vitest';

// constants and types
import { POLICY_ROUND_ROBIN_TALLY_DEFAULT } from '@Fixtures/policies/POLICY_ROUND_ROBIN_TALLY_DEFAULT';
import { POLICY_TYPE_ROUND_ROBIN_TALLY } from '@Constants/policyConstants';
import { SUBJECT_PERSON } from '@Constants/seasonConstants';
import type { Season } from '@Types/seasonTypes';

/**
 * Combined season tables (Mentat `planning/STANDINGS_PHASE_2_PLAN.md` § 1.3, slice 1.3b): a conference CONF with the
 * divisions EAST (A, B, D) and WEST (C, E, F). Division games are referenced on each division, the cross-division games
 * on the conference. Worked by hand:
 *
 *   EAST: B beat A 6-4 6-4; D beat B 6-4 6-4; A beat D 6-0 6-0
 *   WEST: C beat E 6-2 6-2; C beat F 6-2 6-2
 *   CONF: A beat F 6-0 6-0; B beat E 6-3 6-3
 *
 *   wins: A 2, B 2, C 2; D 1; E, F 0
 *   games difference: A +20 (-4, +12, +12), C +16, B +6 (+4, -4, +6); D -8; E -14, F -20
 *
 *   Division ranks over EVERY game, by the division policy (the default: head-to-head first):
 *     EAST: A and B level on 2 wins, B beat A → B 1, A 2; D 3
 *     WEST: C 1; E and F level, never met; games percentage E 10/34 (.294), F 4/28 (.143) → E 2, F 3
 *   Over the division's own games alone EAST would differ: a 1-1-1 cycle, games percentage A .625, B .5, D .375.
 *
 *   Conference policy: preReduce by tier, then games difference (the NFL wild card's first step).
 *     Tied at 2: A, B, C. Candidates B (EAST's best) and C: C (+16) is placed. Then A and B reduce to B: B, then A.
 *     Tied at 0: E and F, both WEST, reduce to E: E, then F.
 *   With EAST ranked on its own games, A would be the candidate: A, C, B, which is also games difference alone.
 */

const subject = (subjectId: string) => ({ subjectType: SUBJECT_PERSON, subjectId });

function tierMatchUps(tournamentId: string, results: CorpusResult[]) {
  return buildMatchUps({ results }).map((matchUp) => ({
    ...matchUp,
    matchUpId: `${tournamentId}-${matchUp.matchUpId}`,
    drawId: `${tournamentId}-draw`,
    eventId: `${tournamentId}-event`,
    tournamentId,
    sides: matchUp.sides?.map((side) => {
      const letter = side.participantId as string;
      const participantId = `${tournamentId}-${letter}`;
      return {
        ...side,
        participantId,
        participant: { participantId, participantType: 'INDIVIDUAL', person: { personId: letter } },
      };
    }),
  })) as any[];
}

const MATCH_UPS = [
  ...tierMatchUps('EAST', [
    { sides: ['B', 'A'], score: '6-4 6-4', winningSide: 1 },
    { sides: ['D', 'B'], score: '6-4 6-4', winningSide: 1 },
    { sides: ['A', 'D'], score: '6-0 6-0', winningSide: 1 },
  ]),
  ...tierMatchUps('WEST', [
    { sides: ['C', 'E'], score: '6-2 6-2', winningSide: 1 },
    { sides: ['C', 'F'], score: '6-2 6-2', winningSide: 1 },
  ]),
  ...tierMatchUps('CONF', [
    { sides: ['A', 'F'], score: '6-0 6-0', winningSide: 1 },
    { sides: ['B', 'E'], score: '6-3 6-3', winningSide: 1 },
  ]),
];

const DIVISION_POLICY = POLICY_ROUND_ROBIN_TALLY_DEFAULT[POLICY_TYPE_ROUND_ROBIN_TALLY];
const WILD_CARD = { preReduce: { groupBy: 'tier' }, tallyDirectives: [{ attribute: 'gamesDiff' }] };

function season(conferencePolicy: Record<string, unknown> = WILD_CARD): Season {
  const tier = (tierId: string, extra: Record<string, unknown> = {}) => ({
    tier: { system: 'MOCK', value: tierId },
    tierId,
    ...extra,
  });
  return {
    seasonId: 'S',
    seriesId: 'SERIES',
    name: 'Season',
    startDate: '2026-01-01',
    status: 'ACTIVE',
    tiers: [
      tier('CONF', { tallyPolicy: conferencePolicy }),
      tier('EAST', { parentTierId: 'CONF', tallyPolicy: DIVISION_POLICY }),
      tier('WEST', { parentTierId: 'CONF', tallyPolicy: DIVISION_POLICY }),
    ],
    periods: [
      {
        periodId: 'P1',
        periodNumber: 1,
        includeInStandings: true,
        competitions: ['EAST', 'WEST', 'CONF'].map((tierId) => ({ tierId, tournamentId: tierId })),
        placements: [
          { tierId: 'EAST', subjects: ['A', 'B', 'D'].map(subject) },
          { tierId: 'WEST', subjects: ['C', 'E', 'F'].map(subject) },
        ],
      },
    ],
  } as Season;
}

const order = (rows: any[]) => rows.map(({ subject, rank }) => `${subject.subjectId}${rank}`);

describe('combined season tables', () => {
  it('without combine, the conference table holds only the games referenced on it', () => {
    let result: any = getSeasonStandings({ season: season(), matchUps: MATCH_UPS });
    expect(result.error).toBeUndefined();
    expect(order(result.standings.CONF)).toEqual(['A1', 'B2', 'E3', 'F4']);
  });

  it("combines the divisions into the conference, reducing each tied set to each division's best", () => {
    let result: any = getSeasonStandings({ season: season(), matchUps: MATCH_UPS, combine: true });
    expect(result.error).toBeUndefined();
    expect(order(result.standings.CONF)).toEqual(['C1', 'B2', 'A3', 'D4', 'E5', 'F6']);
    expect(result.provisional.CONF).toBe(false);
  });

  it('the combined table is ordered by its own policy: without preReduce, games difference alone', () => {
    const policy = { tallyDirectives: [{ attribute: 'gamesDiff' }] };
    let result: any = getSeasonStandings({ season: season(policy), matchUps: MATCH_UPS, combine: true });
    expect(order(result.standings.CONF)).toEqual(['A1', 'C2', 'B3', 'D4', 'E5', 'F6']);
  });

  it("the divisions' own tables do not change", () => {
    const plain: any = getSeasonStandings({ season: season(), matchUps: MATCH_UPS });
    const combined: any = getSeasonStandings({ season: season(), matchUps: MATCH_UPS, combine: true });
    // CONTROL: the division tables are not empty
    expect(order(plain.standings.EAST)).toEqual(['A1', 'B2', 'D3']);
    expect(combined.standings.EAST).toEqual(plain.standings.EAST);
    expect(combined.standings.WEST).toEqual(plain.standings.WEST);
  });

  it("a tierId of a combined tier reads its divisions' references, and returns that tier's table only", () => {
    let result: any = getSeasonStandings({ season: season(), matchUps: MATCH_UPS, combine: true, tierId: 'CONF' });
    expect(Object.keys(result.standings)).toEqual(['CONF']);
    expect(order(result.standings.CONF)).toEqual(['C1', 'B2', 'A3', 'D4', 'E5', 'F6']);
  });
});

describe('caller groupings in a season are keyed by subjectId', () => {
  it("a caller's ranks reach the tier's ordering: F, the caller's group leader, ahead of E", () => {
    // WEST alone: E and F lost to C by the same score and never met, so the default policy leaves them level
    const policy = { headToHead: { disabled: true }, tallyDirectives: [{ attribute: 'groupLeader', groupBy: 'x' }] };
    const plain = season();
    const tiers = plain.tiers.map((t) => (t.tierId === 'WEST' ? { ...t, tallyPolicy: policy } : t));
    // CONTROL: level without the caller's ranks
    expect(order((getSeasonStandings({ season: plain, matchUps: MATCH_UPS }) as any).standings.WEST)).toEqual([
      'C1',
      'E2',
      'F2',
    ]);
    let result: any = getSeasonStandings({
      season: { ...plain, tiers } as Season,
      groupRanks: { x: { F: 1, E: 2 } },
      matchUps: MATCH_UPS,
    });
    expect(order(result.standings.WEST)).toEqual(['C1', 'F2', 'E3']);
  });
});
