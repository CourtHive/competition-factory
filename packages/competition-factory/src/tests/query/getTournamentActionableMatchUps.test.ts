import { mocksEngine } from '@Assemblies/engines/mock';
import { tournamentEngine } from '@Engines/syncEngine';
import { expect, test, describe } from 'vitest';

// constants
import { SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { ABANDONED } from '@Constants/matchUpStatusConstants';

describe('getTournamentActionableMatchUps', () => {
  test('a fully-completed tournament is effectivelyComplete and allDecided', () => {
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawId: 'cc', drawSize: 8, drawType: SINGLE_ELIMINATION }],
      completeAllMatchUps: true,
      setState: true,
    });
    const result: any = tournamentEngine.getTournamentActionableMatchUps();
    expect(result.effectivelyComplete).toEqual(true);
    expect(result.allDecided).toEqual(true);
    expect(result.counts.actionable).toEqual(0);
    expect(result.actionableMatchUpIds).toEqual([]);
  });

  test('an unplayed draw with ready round-1 matchUps is not effectivelyComplete', () => {
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawId: 'dd', drawSize: 8, drawType: SINGLE_ELIMINATION }],
      setState: true,
    });
    const result: any = tournamentEngine.getTournamentActionableMatchUps();
    expect(result.effectivelyComplete).toEqual(false);
    expect(result.counts.actionable).toBeGreaterThan(0);
    expect(result.actionableMatchUpIds.length).toEqual(result.counts.actionable);
  });

  test('abandoning every actionable matchUp makes it effectivelyComplete but not allDecided', () => {
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawId: 'ee', drawSize: 8, drawType: SINGLE_ELIMINATION }],
      setState: true,
    });
    let state: any = tournamentEngine.getTournamentActionableMatchUps();
    for (const matchUpId of state.actionableMatchUpIds) {
      const outcome: any = { matchUpStatus: ABANDONED };
      tournamentEngine.setMatchUpStatus({ matchUpId, drawId: 'ee', outcome });
    }
    state = tournamentEngine.getTournamentActionableMatchUps();
    expect(state.counts.actionable).toEqual(0);
    expect(state.effectivelyComplete).toEqual(true);
    // downstream matchUps remain pending — no advancer ever arrives (non-directing exits)
    expect(state.allDecided).toEqual(false);
    expect(state.counts.pending).toBeGreaterThan(0);
  });
});
