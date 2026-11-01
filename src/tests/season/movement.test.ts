import { getSeasonMovement } from '@Query/season/getSeasonMovement';
import { planNextPeriod } from '@Query/season/planNextPeriod';
import { validateSeason } from '@Validators/validateSeason';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it, describe } from 'vitest';

// constants and types
import type { Season, SeasonMovementOverride, SeasonSubject } from '@Types/seasonTypes';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { TierMovementEnum } from '@Types/tournamentTypes';

const { PROMOTED, RELEGATED, HELD, WITHDRAWN } = TierMovementEnum;

// a box league: three boxes of four, two cycles; DOMINANT_DUO keeps generation cheap under coverage
const seasonProfile = {
  tiers: [
    { tierId: 'box-1', tierValue: 'Box 1', teamsCount: 4 },
    { tierId: 'box-2', tierValue: 'Box 2', teamsCount: 4 },
    { tierId: 'box-3', tierValue: 'Box 3', teamsCount: 4 },
  ],
  tieFormatName: 'DOMINANT_DUO',
  periods: [{}, {}],
};

let cached: { season: Season; matchUps: any[] } | undefined;
function boxLeague(): { season: Season; matchUps: any[] } {
  if (!cached) {
    const result: any = mocksEngine.generateSeason({ seasonProfile });
    expect(result.error).toBeUndefined();
    const matchUps = Object.values(result.tournamentRecords).flatMap((tournamentRecord: any) => {
      tournamentEngine.setState(tournamentRecord);
      return tournamentEngine.allTournamentMatchUps().matchUps;
    });
    cached = { season: { ...result.season, movementRules: [{ promote: 1, relegate: 1 }] }, matchUps };
  }
  return { season: structuredClone(cached.season), matchUps: cached.matchUps };
}

const key = (subject: SeasonSubject) => `${subject.subjectType}:${subject.subjectId}`;

describe('getSeasonMovement', () => {
  it('proposes one up and one down per box, and labels each move with getTierMovement', () => {
    const { season, matchUps } = boxLeague();
    const periodId = season.periods[0].periodId;
    let result: any = getSeasonMovement({ season, periodId, matchUps });
    expect(result.error).toBeUndefined();

    // every placed subject is either proposed or reported tied, exactly once
    const proposed = result.proposals.map((proposal) => key(proposal.subject));
    const tied = result.tiedAtCut.flatMap((tie) => tie.subjects.map(key));
    expect(new Set([...proposed, ...tied]).size).toEqual(12);
    expect(proposed.filter((subject) => tied.includes(subject))).toEqual([]);

    const moved = (tierId: string, movement: string) =>
      result.proposals.filter((proposal) => proposal.fromTierId === tierId && proposal.movement === movement);
    const tiePlaces = (tierId: string, cut: string) =>
      result.tiedAtCut.find((tie) => tie.tierId === tierId && tie.cut === cut)?.placesAtCut ?? 0;

    // the top box cannot promote, the bottom box cannot relegate
    expect(moved('box-1', PROMOTED)).toEqual([]);
    expect(moved('box-3', RELEGATED)).toEqual([]);
    for (const [tierId, up, down] of [
      ['box-1', 0, 1],
      ['box-2', 1, 1],
      ['box-3', 1, 0],
    ] as const) {
      expect(moved(tierId, PROMOTED).length + tiePlaces(tierId, 'PROMOTE')).toEqual(up);
      expect(moved(tierId, RELEGATED).length + tiePlaces(tierId, 'RELEGATE')).toEqual(down);
    }

    for (const proposal of result.proposals) {
      const rank = (tierId) => season.tiers.find((tier) => tier.tierId === tierId)!.tier.numericRank!;
      if (proposal.movement === PROMOTED) expect(rank(proposal.toTierId)).toEqual(rank(proposal.fromTierId) - 1);
      if (proposal.movement === RELEGATED) expect(rank(proposal.toTierId)).toEqual(rank(proposal.fromTierId) + 1);
      if (proposal.movement === HELD) expect(proposal.toTierId).toEqual(proposal.fromTierId);
    }
  });

  it('a rule naming a tier overrides the default rule', () => {
    const { season, matchUps } = boxLeague();
    season.movementRules = [
      { promote: 1, relegate: 1 },
      { tierId: 'box-1', relegate: 2 },
    ];
    let result: any = getSeasonMovement({ season, periodId: season.periods[0].periodId, matchUps });
    const relegated = result.proposals.filter((p) => p.fromTierId === 'box-1' && p.movement === RELEGATED).length;
    const tied = result.tiedAtCut.find((tie) => tie.tierId === 'box-1' && tie.cut === 'RELEGATE')?.placesAtCut ?? 0;
    expect(relegated + tied).toEqual(2);
  });

  it('reports subjects level across a cut instead of deciding between them', () => {
    const { season, matchUps } = boxLeague();
    // every team level: each cut is a tie between all four
    let result: any = getSeasonMovement({
      season,
      periodId: season.periods[0].periodId,
      matchUps,
      orderBy: ['matchUpsDrawn'],
    });
    expect(result.proposals).toEqual([]);
    expect(
      result.tiedAtCut.map(({ tierId, cut, placesAtCut, subjects }) => [tierId, cut, placesAtCut, subjects.length]),
    ).toEqual([
      ['box-1', 'RELEGATE', 1, 4],
      ['box-2', 'PROMOTE', 1, 4],
      ['box-2', 'RELEGATE', 1, 4],
      ['box-3', 'PROMOTE', 1, 4],
    ]);
  });

  it('refuses an unknown period and a season with no movement rules', () => {
    const { season, matchUps } = boxLeague();
    let result: any = getSeasonMovement({ season, periodId: 'nope', matchUps });
    expect(result.error).toEqual(INVALID_VALUES);
    result = getSeasonMovement({
      season: { ...season, movementRules: undefined },
      periodId: season.periods[0].periodId,
      matchUps,
    });
    expect(result.error).toEqual(INVALID_VALUES);
  });
});

describe('planNextPeriod', () => {
  function settleTies(tiedAtCut: any[]): SeasonMovementOverride[] {
    // keep every tied subject where it is: an operator's decision, recorded as a revision
    return tiedAtCut.flatMap((tie) =>
      tie.subjects.map((subject) => ({ subject, toTierId: tie.tierId, reason: 'tie: held' })),
    );
  }

  it("turns period 1's movement into period 2's placements without touching the season", () => {
    const { season, matchUps } = boxLeague();
    const before = structuredClone(season);
    const periodId = season.periods[0].periodId;
    const movement: any = getSeasonMovement({ season, periodId, matchUps });
    const overrides = settleTies(movement.tiedAtCut);

    let result: any = planNextPeriod({
      season,
      periodId,
      movements: movement.proposals,
      tiedAtCut: movement.tiedAtCut,
      overrides,
    });
    expect(result.error).toBeUndefined();
    expect(result.nextPeriodId).toEqual(season.periods[1].periodId);
    expect(season).toEqual(before);

    const placed = result.placements.flatMap((placement) => placement.subjects.map(key));
    expect(placed).toHaveLength(12);
    expect(new Set(placed).size).toEqual(12);
    for (const proposal of movement.proposals) {
      const placement = result.placements.find((p) =>
        p.subjects.some((subject) => key(subject) === key(proposal.subject)),
      );
      expect(placement.tierId).toEqual(proposal.toTierId);
    }
    // the next period's placements validate as part of the season
    season.periods[1].placements = result.placements;
    expect(validateSeason({ season }).valid).toEqual(true);
  });

  it('refuses to place tied subjects nobody has decided', () => {
    const { season, matchUps } = boxLeague();
    const periodId = season.periods[0].periodId;
    const movement: any = getSeasonMovement({ season, periodId, matchUps, orderBy: ['matchUpsDrawn'] });
    let result: any = planNextPeriod({
      season,
      periodId,
      movements: movement.proposals,
      tiedAtCut: movement.tiedAtCut,
    });
    expect(result.error).toEqual(INVALID_VALUES);
    expect(result.context.unsettled).toHaveLength(12);

    result = planNextPeriod({
      overrides: settleTies(movement.tiedAtCut),
      movements: movement.proposals,
      tiedAtCut: movement.tiedAtCut,
      periodId,
      season,
    });
    expect(result.error).toBeUndefined();
    expect(result.revisions).toHaveLength(12);
    expect(result.revisions.every((revision) => revision.movement === HELD && revision.reason === 'tie: held')).toEqual(
      true,
    );
  });

  it('records an override that departs from a proposal, and a withdrawal', () => {
    const { season, matchUps } = boxLeague();
    const periodId = season.periods[0].periodId;
    const movement: any = getSeasonMovement({ season, periodId, matchUps });
    const [first, second] = movement.proposals.filter((proposal) => proposal.fromTierId === 'box-2');
    const overrides: SeasonMovementOverride[] = [
      ...settleTies(movement.tiedAtCut),
      { subject: first.subject, toTierId: 'box-3', reason: 'requested a lower box', by: 'league admin' },
      { subject: second.subject, reason: 'left the league' },
    ];

    let result: any = planNextPeriod({
      season,
      periodId,
      movements: movement.proposals,
      tiedAtCut: movement.tiedAtCut,
      overrides,
    });
    const revision = (subject) => result.revisions.find((r) => key(r.subject) === key(subject));
    if (first.toTierId !== 'box-3') {
      expect(revision(first.subject)).toMatchObject({
        proposedTierId: first.toTierId,
        by: 'league admin',
        movement: RELEGATED,
        fromTierId: 'box-2',
        toTierId: 'box-3',
      });
    }
    expect(revision(second.subject)).toMatchObject({ movement: WITHDRAWN, reason: 'left the league' });
    const placed = result.placements.flatMap((placement) => placement.subjects.map(key));
    expect(placed).not.toContain(key(second.subject));
    expect(placed).toHaveLength(11);
  });

  it('refuses an override to an unknown tier and an unknown period', () => {
    const { season } = boxLeague();
    const subject = { subjectType: 'TEAM', subjectId: 'x' } as SeasonSubject;
    let result: any = planNextPeriod({
      season,
      periodId: season.periods[0].periodId,
      movements: [],
      overrides: [{ subject, toTierId: 'nope' }],
    });
    expect(result.error).toEqual(INVALID_VALUES);
    result = planNextPeriod({ season, periodId: 'nope', movements: [] });
    expect(result.error).toEqual(INVALID_VALUES);
  });
});

describe('validateSeason: movementRules', () => {
  it('reports unknown tiers, duplicate rules, bad counts and tiers it cannot order', () => {
    const { season } = boxLeague();
    season.movementRules = [{ promote: 1 }, { relegate: 1 }, { tierId: 'nope' }, { tierId: 'box-1', promote: -1 }];
    delete season.tiers[1].tier.numericRank;
    season.tiers[2].tier.numericRank = 1;
    let result: any = validateSeason({ season });
    expect(result.error).toEqual(INVALID_VALUES);
    expect(result.context.errors).toEqual(
      expect.arrayContaining([
        'more than one movement rule for (default)',
        'movement rule names an unknown tierId: nope',
        'movement rule for box-1: promote and relegate must be whole numbers >= 0',
        'tier box-2 needs tier.numericRank for movement',
        'tier box-3 shares numericRank 1 with a sibling tier',
      ]),
    );
  });
});
