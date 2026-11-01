import { getSeasonAdvancement } from '@Query/season/getSeasonAdvancement';
import { getSeasonStandings } from '@Query/season/getSeasonStandings';
import { validateSeason } from '@Validators/validateSeason';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it, describe } from 'vitest';

// constants and types
import { ADVANCE_BERTHS_BY_SIZE, ADVANCE_TOP_N, PHASE_CHAMPIONSHIP, SUBJECT_TEAM } from '@Constants/seasonConstants';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { TEAM_MATCHUP } from '@Constants/matchUpTypes';
import type { Season } from '@Types/seasonTypes';

const seasonProfile = {
  tiers: [
    { tierId: 'A1', tierValue: 'A-1', teamsCount: 4 },
    { tierId: 'B1', tierValue: 'B-1', teamsCount: 6 },
  ],
  periods: [{}, {}],
  seasonName: 'Spring',
};

function generate(profile: any = seasonProfile) {
  const result: any = mocksEngine.generateSeason({ seasonProfile: profile });
  expect(result.success ?? !result.error).toEqual(true);
  return result as { season: Season; tournamentRecords: Record<string, any> };
}

function inContextMatchUps(tournamentRecords: Record<string, any>) {
  return Object.values(tournamentRecords).flatMap((tournamentRecord) => {
    tournamentEngine.setState(tournamentRecord);
    return tournamentEngine.allTournamentMatchUps().matchUps;
  });
}

const clone = (season: Season): Season => structuredClone(season);

describe('generateSeason', () => {
  it('emits one record per period, one TEAM event per tier, and a valid Season referencing them', () => {
    const { season, tournamentRecords } = generate();
    expect(Object.keys(tournamentRecords)).toEqual(['mock-season-P1', 'mock-season-P2']);
    for (const tournamentRecord of Object.values(tournamentRecords)) {
      expect(tournamentRecord.events.map((event) => event.eventName)).toEqual(['A-1', 'B-1']);
    }
    expect(validateSeason({ season }).valid).toEqual(true);
    expect(season.periods.map((period) => period.competitions.length)).toEqual([2, 2]);
    expect(season.periods[0].placements?.[1].subjects).toHaveLength(6);
  });
});

describe('getSeasonStandings', () => {
  it('aggregates each team across both period records, per tier', () => {
    const { season, tournamentRecords } = generate();
    const matchUps = inContextMatchUps(tournamentRecords);

    let result: any = getSeasonStandings({ season, matchUps });
    expect(result.error).toBeUndefined();
    expect(result.unanswered).toEqual([]);
    expect(result.unmapped).toEqual([]);
    expect(result.unplaced).toEqual([]);
    expect(result.standings.A1).toHaveLength(4);
    expect(result.standings.B1).toHaveLength(6);

    // an independent count: a round robin of 4 is 3 ties a period, so 6 across the season
    const teamMatchUps = matchUps.filter((matchUp) => matchUp.matchUpType === TEAM_MATCHUP);
    for (const row of [...result.standings.A1, ...result.standings.B1]) {
      const played = teamMatchUps.filter((matchUp) =>
        matchUp.sides.some((side) => side.participantId === row.subject.subjectId),
      );
      const won = played.filter(
        (matchUp) => matchUp.sides[matchUp.winningSide - 1].participantId === row.subject.subjectId,
      );
      expect(row.matchUpsWon).toEqual(won.length);
      expect(row.matchUpsWon + row.matchUpsLost).toEqual(played.length);
      expect(row.participantIds).toEqual([row.subject.subjectId]);
    }
    expect(result.standings.A1.every((row) => row.matchUpsWon + row.matchUpsLost === 6)).toEqual(true);

    // ranked by matchUps won first
    const won = result.standings.B1.map((row) => row.matchUpsWon);
    expect(won).toEqual([...won].sort((a, b) => b - a));
    expect(result.standings.B1[0].rank).toEqual(1);
  });

  it('sums the tie score as value won and lost', () => {
    const { season, tournamentRecords } = generate();
    const matchUps = inContextMatchUps(tournamentRecords);
    let result: any = getSeasonStandings({ season, matchUps, tierId: 'A1' });
    const totalWon = result.standings.A1.reduce((sum, row) => sum + row.valueWon, 0);
    const totalLost = result.standings.A1.reduce((sum, row) => sum + row.valueLost, 0);
    expect(totalWon).toBeGreaterThan(0);
    expect(totalWon).toEqual(totalLost); // every point one side wins, the other side concedes
    expect(Object.keys(result.standings)).toEqual(['A1']);
  });

  it('counts one period alone, and leaves out a period that does not count toward standings', () => {
    const { season, tournamentRecords } = generate({ ...seasonProfile, periods: [{}, { includeInStandings: false }] });
    const matchUps = inContextMatchUps(tournamentRecords);

    let result: any = getSeasonStandings({ season, matchUps });
    expect(result.standings.A1.every((row) => row.matchUpsWon + row.matchUpsLost === 3)).toEqual(true);

    result = getSeasonStandings({ season, matchUps, periodId: season.periods[1].periodId });
    expect(result.standings.A1.every((row) => row.matchUpsWon + row.matchUpsLost === 3)).toEqual(true);

    result = getSeasonStandings({ season, matchUps, periodId: 'nope' });
    expect(result.error).toEqual(INVALID_VALUES);
  });

  it('reports a reference no matchUp answered instead of shrinking the table', () => {
    const { season, tournamentRecords } = generate();
    const matchUps = inContextMatchUps(tournamentRecords).filter(
      (matchUp) => matchUp.tournamentId !== 'mock-season-P2',
    );
    let result: any = getSeasonStandings({ season, matchUps });
    expect(result.unanswered).toEqual(season.periods[1].competitions);
    // placed teams are still listed, with what they have played
    expect(result.standings.A1).toHaveLength(4);
  });

  it('reports a participant it cannot resolve to a subject, and one playing outside its placement', () => {
    const { season, tournamentRecords } = generate();
    const matchUps = inContextMatchUps(tournamentRecords);

    let result: any = getSeasonStandings({
      getSubjectId: (participant) =>
        participant.participantId === 'A1-team-1' ? undefined : participant.participantId,
      matchUps,
      season,
    });
    expect(result.unmapped.map(({ participantId }) => participantId)).toEqual(['A1-team-1', 'A1-team-1']);

    const misplaced = clone(season);
    misplaced.periods[0].placements![0].subjects = misplaced.periods[0].placements![0].subjects.slice(1);
    result = getSeasonStandings({ season: misplaced, matchUps });
    expect(result.unplaced).toEqual([
      {
        tierId: 'A1',
        periodId: season.periods[0].periodId,
        subject: { subjectType: SUBJECT_TEAM, subjectId: 'A1-team-1' },
      },
    ]);
  });

  it('gives subjects level on every ordered field the same rank', () => {
    const { season, tournamentRecords } = generate();
    let result: any = getSeasonStandings({
      season,
      matchUps: inContextMatchUps(tournamentRecords),
      orderBy: ['matchUpsDrawn'],
    });
    expect(result.standings.A1.map((row) => row.rank)).toEqual([1, 1, 1, 1]);
  });

  it('refuses an invalid season', () => {
    let result: any = getSeasonStandings({ season: { ...generate().season, tiers: [] }, matchUps: [] });
    expect(result.error).toEqual(INVALID_VALUES);
  });
});

describe('getSeasonAdvancement (R10)', () => {
  function withChampionship(season: Season): Season {
    const championship = clone(season);
    championship.tiers.push({ tierId: 'CH', tier: { system: 'MOCK', value: 'Championship' } });
    championship.periods.push({
      periodId: 'championship',
      periodNumber: 3,
      phase: PHASE_CHAMPIONSHIP,
      includeInStandings: false,
      competitions: [],
    });
    championship.advancements = ['A1', 'B1'].map((tierId) => ({
      advancementId: `${tierId}-winner`,
      fromPeriodId: season.periods[1].periodId,
      fromTierId: tierId,
      rule: { type: ADVANCE_TOP_N, n: 1 },
      to: { periodId: 'championship', tierId: 'CH' },
    }));
    return championship;
  }

  it("advances each tier's leader out of its period", () => {
    const { season, tournamentRecords } = generate();
    const matchUps = inContextMatchUps(tournamentRecords);
    const championship = withChampionship(season);
    expect(validateSeason({ season: championship }).valid).toEqual(true);

    let result: any = getSeasonAdvancement({ season: championship, matchUps });
    expect(result.outcomes).toHaveLength(2);
    for (const outcome of result.outcomes) {
      const standings: any = getSeasonStandings({
        periodId: outcome.advancement.fromPeriodId,
        tierId: outcome.advancement.fromTierId,
        season: championship,
        matchUps,
      });
      const leaders = standings.standings[outcome.advancement.fromTierId].filter((row) => row.rank === 1);
      if (leaders.length === 1) expect(outcome.advancing).toEqual([leaders[0].subject]);
      else expect(outcome.tiedAtCut).toEqual(leaders.map((row) => row.subject));
    }
  });

  it('scales berths with the size of the tier', () => {
    const { season, tournamentRecords } = generate();
    const championship = withChampionship(season);
    // 4 teams in A1 and 6 in B1: one berth below 5 teams, two from 5
    for (const advancement of championship.advancements ?? []) {
      advancement.rule = {
        type: ADVANCE_BERTHS_BY_SIZE,
        berths: [
          { minSubjects: 5, n: 2 },
          { minSubjects: 0, n: 1 },
        ],
      };
    }
    expect(validateSeason({ season: championship }).valid).toEqual(true);

    let result: any = getSeasonAdvancement({ season: championship, matchUps: inContextMatchUps(tournamentRecords) });
    expect(result.outcomes.map((outcome) => outcome.berths)).toEqual([1, 2]);
    for (const outcome of result.outcomes) {
      expect(outcome.advancing.length + (outcome.tiedAtCut ? 1 : 0)).toBeGreaterThanOrEqual(
        Math.min(outcome.berths, 1),
      );
      expect(outcome.advancing.length).toBeLessThanOrEqual(outcome.berths);
    }

    championship.advancements![0].rule = { type: ADVANCE_BERTHS_BY_SIZE, berths: [] } as any;
    expect(validateSeason({ season: championship }).error).toEqual(INVALID_VALUES);
  });

  it('does not pick between subjects level at the cut', () => {
    const { season, tournamentRecords } = generate();
    let result: any = getSeasonAdvancement({
      season: withChampionship(season),
      matchUps: inContextMatchUps(tournamentRecords),
      orderBy: ['matchUpsDrawn'], // every team level
      advancementId: 'A1-winner',
    });
    expect(result.outcomes[0].advancing).toEqual([]);
    expect(result.outcomes[0].tiedAtCut).toHaveLength(4);
  });
});

describe('validateSeason', () => {
  const errorsOf = (season: any) => {
    const result: any = validateSeason({ season });
    expect(result.error).toEqual(INVALID_VALUES);
    return result.context.errors as string[];
  };

  it('reports every structural problem', () => {
    const season: any = clone(generate().season);
    season.status = 'OPEN';
    season.tiers.push({ ...season.tiers[0] });
    season.tiers[1].parentTierId = 'B1';
    season.periods[1].periodNumber = 1;
    delete season.periods[1].includeInStandings;
    season.periods[0].competitions.push({ tierId: 'Z9', tournamentId: 'x', drawId: 'd' });
    season.periods[0].placements[1].subjects.push(season.periods[0].placements[0].subjects[0]);
    season.advancements = [
      {
        advancementId: 'x',
        fromPeriodId: season.periods[0].periodId,
        fromTierId: 'A1',
        rule: { type: ADVANCE_TOP_N, n: 0 },
        to: { periodId: season.periods[0].periodId, tierId: 'A1' },
      },
    ];

    const errors = errorsOf(season);
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('status must be one of'),
        'duplicate tierId: A1',
        'tier B1 is its own ancestor',
        'duplicate periodNumber: 1',
        `period ${season.periods[1].periodId} must declare includeInStandings`,
        `period ${season.periods[0].periodId}: competition names an unknown tierId: Z9`,
        `period ${season.periods[0].periodId}: a drawId reference must also name its eventId`,
        expect.stringContaining('is placed in two tiers'),
        'advancement x must advance into a later period',
        expect.stringContaining('needs rule'),
      ]),
    );
  });

  it('requires identities, tiers and periods', () => {
    expect(errorsOf({})).toEqual(
      expect.arrayContaining([
        'seasonId is required',
        'tiers must be a non-empty array',
        'periods must be a non-empty array',
      ]),
    );
    expect(validateSeason({ season: undefined }).error).toEqual(INVALID_VALUES);
  });
});
