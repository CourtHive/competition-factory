import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { describe, expect, it } from 'vitest';

// constants and types
import { POLICY_TYPE_MATCHUP_ACTIONS } from '@Constants/policyConstants';
import { CLEAR_SCORE, SCORE } from '@Constants/matchUpActionConstants';

function final() {
  let result: any = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4 }],
    completeAllMatchUps: true,
    nonRandom: 20261120,
    setState: true,
  });
  expect(result.error).toBeUndefined();
  return tournamentEngine
    .allTournamentMatchUps({ inContext: true })
    .matchUps.find((matchUp) => matchUp.roundNumber === 2)!;
}

function policy(disabledActions: string[] = [], enabledActions: string[] = [], stages: string[] = []) {
  return {
    [POLICY_TYPE_MATCHUP_ACTIONS]: {
      enabledStructures: [{ stages, stageSequences: [], disabledActions, enabledActions }],
    },
  };
}

function types(matchUp, policyDefinitions?) {
  let result: any = tournamentEngine.matchUpActions({
    drawId: matchUp.drawId,
    matchUpId: matchUp.matchUpId,
    ...(policyDefinitions ? { policyDefinitions } : {}),
  });
  expect(result.error).toBeUndefined();
  return result.validActions.map((action) => action.type).filter((type) => type === SCORE || type === CLEAR_SCORE);
}

describe('canonical result action policy', () => {
  it('keeps SCORE and CLEAR_SCORE available by default on a completed final', () => {
    expect(types(final())).toEqual([SCORE, CLEAR_SCORE]);
  });

  it.each([
    [[SCORE], [], [CLEAR_SCORE]],
    [[CLEAR_SCORE], [], [SCORE]],
    [[SCORE, CLEAR_SCORE], [], []],
    [[], [SCORE], [SCORE]],
    [[], [CLEAR_SCORE], [CLEAR_SCORE]],
  ])('honors disabled %j and enabled %j', (disabled, enabled, expected) => {
    expect(types(final(), policy(disabled, enabled))).toEqual(expected);
  });

  it('withholds result actions when the structure has no matching enabled policy', () => {
    expect(types(final(), policy([], [], ['QUALIFYING']))).toEqual([]);
  });

  it('honors the persisted draw policy, without a caller override', () => {
    const matchUp = final();
    let result: any = tournamentEngine.attachPolicies({
      drawId: matchUp.drawId,
      policyDefinitions: policy([SCORE, CLEAR_SCORE]),
    });
    expect(result.error).toBeUndefined();
    expect(types(matchUp)).toEqual([]);
  });
});
