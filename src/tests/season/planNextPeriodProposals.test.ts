import { getSeasonMovement } from '@Query/season/getSeasonMovement';
import { planNextPeriod } from '@Query/season/planNextPeriod';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants and types
import type { Season, SeasonMovementProposal, SeasonSubject } from '@Types/seasonTypes';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { TierMovementEnum } from '@Types/tournamentTypes';

const { RELEGATED, HELD } = TierMovementEnum;

/** SEASON-101: proposals are validated as overrides are; none may drop, double or split a subject. */
const season = {
  tiers: [
    { tierId: 'T1', tier: { numericRank: 1 } },
    { tierId: 'T2', tier: { numericRank: 2 } },
  ],
  periods: [
    { periodId: 'P', periodNumber: 1 },
    { periodId: 'Q', periodNumber: 2 },
  ],
} as unknown as Season;
const A: SeasonSubject = { subjectType: 'TEAM', subjectId: 'A' };
const proposal = (toTierId: string, movement = RELEGATED): SeasonMovementProposal =>
  ({ subject: A, fromTierId: 'T1', toTierId, movement, rank: 4 }) as SeasonMovementProposal;

describe('planNextPeriod proposal targets (SEASON-101)', () => {
  it('places a single valid proposal', () => {
    let result: any = planNextPeriod({ season, periodId: 'P', movements: [proposal('T2')] });
    expect(result.error).toBeUndefined();
    expect(result.placements).toEqual([{ tierId: 'T2', subjects: [A] }]);
  });

  it('refuses a proposal to an unknown tier instead of dropping its subject', () => {
    let result: any = planNextPeriod({ season, periodId: 'P', movements: [proposal('T9')] });
    expect(result.error).toEqual(INVALID_VALUES);
    expect(result.info).toEqual('unknown toTierId');
    expect(result.context.proposal.toTierId).toEqual('T9');
  });

  it('refuses a subject proposed twice instead of placing it twice', () => {
    let result: any = planNextPeriod({ season, periodId: 'P', movements: [proposal('T2'), proposal('T2')] });
    expect(result.error).toEqual(INVALID_VALUES);
    expect(result.info).toEqual('duplicate proposals for one subject');
    expect(result.context.subject).toEqual(A);
    expect(result.context.proposals).toHaveLength(2);
  });

  it('refuses conflicting proposals instead of placing one subject in two tiers', () => {
    let result: any = planNextPeriod({
      season,
      periodId: 'P',
      movements: [proposal('T2'), proposal('T1', HELD)],
    });
    expect(result.error).toEqual(INVALID_VALUES);
    expect(result.info).toEqual('conflicting proposals for one subject');
    expect(result.context.proposals.map((p) => p.toTierId)).toEqual(['T2', 'T1']);
  });

  it('still accepts the getSeasonMovement → planNextPeriod pipeline', () => {
    const generated: any = mocksEngine.generateSeason({
      seasonProfile: {
        tiers: [
          { tierId: 'box-1', tierValue: 'Box 1', teamsCount: 4 },
          { tierId: 'box-2', tierValue: 'Box 2', teamsCount: 4 },
        ],
        tieFormatName: 'DOMINANT_DUO',
        periods: [{}, {}],
      },
    });
    expect(generated.error).toBeUndefined();
    const matchUps = Object.values(generated.tournamentRecords).flatMap((tournamentRecord: any) => {
      tournamentEngine.setState(tournamentRecord);
      return tournamentEngine.allTournamentMatchUps().matchUps;
    });
    const boxSeason: Season = { ...generated.season, movementRules: [{ promote: 1, relegate: 1 }] };
    const periodId = boxSeason.periods[0].periodId;
    const movement: any = getSeasonMovement({ season: boxSeason, periodId, matchUps });
    expect(movement.error).toBeUndefined();
    const overrides = movement.tiedAtCut.flatMap((tie) =>
      tie.subjects.map((subject) => ({ subject, toTierId: tie.tierId, reason: 'tie: held' })),
    );
    let result: any = planNextPeriod({
      season: boxSeason,
      periodId,
      movements: movement.proposals,
      tiedAtCut: movement.tiedAtCut,
      overrides,
    });
    expect(result.error).toBeUndefined();
    const placed = result.placements.flatMap((placement) => placement.subjects.map((s) => s.subjectId));
    expect(placed).toHaveLength(8);
    expect(new Set(placed).size).toEqual(8);
  });
});
