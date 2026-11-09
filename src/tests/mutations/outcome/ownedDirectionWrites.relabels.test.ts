import { setOutcomePipeline, setSubscriptions } from '@Global/state/globalState';
import { registerTestSeedIdentity } from '@Tests/testHarness/seedMathRandom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { setClock } from '@Tools/clock';
import {
  won,
  POLICY_OFF,
  play,
  compareUndirectedWinner,
  TEAM_AWARD_NOTICE_CASES,
  prepareTeamAwardNotice,
  HELD_BYE_RELABEL_CASES,
} from '@Tests/testHarness/outcome/directionFixtures';

// constants and types
import { FIRST_MATCH_LOSER_CONSOLATION } from '@Constants/drawDefinitionConstants';
import type { Scenario } from '@Tests/testHarness/outcome/directionFixtures';
import { TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';
import {
  OUTCOME_PIPELINE_DIFFERENTIAL,
  OUTCOME_PIPELINE_V1,
  OUTCOME_PIPELINE_V2,
} from '@Constants/outcomePipelineConstants';

vi.mock('@Mutate/matchUps/matchUpStatus/setMatchUpState', async (importOriginal) => {
  const actual: any = await importOriginal();
  const { v1Writes } = await import('@Tests/testHarness/outcome/directionCounter');
  return {
    ...actual,
    setMatchUpState: (...args: any[]) => {
      v1Writes.count += 1;
      return actual.setMatchUpState(...args);
    },
  };
});

registerTestSeedIdentity('src/tests/mutations/outcome/ownedDirectionWrites.relabels.test.ts', (title, ordinal) => ({
  name: 'src/tests/mutations/outcome/ownedDirectionWrites.test.ts::' + title,
  ordinal,
}));

afterEach(() => {
  setOutcomePipeline(OUTCOME_PIPELINE_V1);
  setSubscriptions({ subscriptions: {} });
  setClock();
});

describe('C24N TEAM arrivals retain event identity at a standing awarded exit', () => {
  it.each(TEAM_AWARD_NOTICE_CASES)('$label', (recipe) => {
    const { scenario, prepared } = prepareTeamAwardNotice(recipe);
    const { v1 } = compareUndirectedWinner(scenario, recipe.owned, prepared);
    expect(v1.results[0].success).toEqual(true);
    expect(v1.v1Writes).toBeGreaterThan(0);
    expect(v1.notices.length).toBeGreaterThan(0);
  });
});

describe('C24 a played result carries its relabel past the loser BYE already held', () => {
  it.each(HELD_BYE_RELABEL_CASES)('%s', (_label, drawProfile, policyOff, status, carry, retirement) => {
    setOutcomePipeline(OUTCOME_PIPELINE_V1);
    setClock('2026-10-25T00:00:00.000Z');
    setSubscriptions({ subscriptions: {} });
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ ...drawProfile, drawId: 'd' }],
      nonRandom: 1,
      setState: true,
    });
    if (drawProfile.eventType === 'TEAM')
      expect(
        tournamentEngine.generateLineUps({ useDefaultEventRanking: true, attach: true, drawId: 'd' }).success,
      ).toEqual(true);
    if (policyOff) tournamentEngine.attachPolicies({ policyDefinitions: POLICY_OFF });
    const matches = () =>
      (tournamentEngine.allDrawMatchUps({ drawId: 'd', inContext: true }).matchUps ?? []).filter(
        (matchUp) => !matchUp.collectionId,
      );
    const played = drawProfile.eventType === 'TEAM' ? { winningSide: 1 } : won(1);
    const source = matches().find(
      (matchUp) => matchUp.roundNumber === 1 && matchUp.sides?.filter((side) => side.participantId).length === 2,
    );
    expect(source).toBeDefined();
    for (const matchUp of matches().filter(
      (candidate) =>
        candidate.structureId === source?.structureId &&
        candidate.roundNumber === 1 &&
        candidate.matchUpStatus === TO_BE_PLAYED &&
        candidate.sides?.filter((side) => side.participantId).length === 2,
    ))
      expect(
        tournamentEngine.setMatchUpStatus({
          drawId: 'd',
          matchUpId: matchUp.matchUpId,
          outcome: played,
          propagateExitStatus: false,
        }).success,
      ).toEqual(true);
    const next = matches().find((matchUp) => matchUp.matchUpId === source?.winnerMatchUpId);
    expect(next).toBeDefined();
    expect(
      tournamentEngine.setMatchUpStatus({
        drawId: 'd',
        matchUpId: next?.matchUpId,
        outcome: played,
        propagateExitStatus: false,
      }).success,
    ).toEqual(true);
    const prepared = structuredClone(tournamentEngine.getTournament().tournamentRecord);
    const scenario: Scenario = {
      drawProfile,
      steps: [
        {
          target: { structureName: source?.structureName, roundNumber: 1, roundPosition: source?.roundPosition },
          outcome: { matchUpStatus: status, winningSide: 1 },
          params: { propagateExitStatus: carry, propagateRetirementAsExit: retirement, allowChangePropagation: true },
        },
      ],
    };
    if (drawProfile.drawType === FIRST_MATCH_LOSER_CONSOLATION && status === WALKOVER) {
      const v1 = play(OUTCOME_PIPELINE_V1, scenario, { prepared });
      expect(v1.results[0].error?.code).toEqual('ERR_CANNOT_CHANGE_FEED_ELIGIBILITY');
      for (const mode of [OUTCOME_PIPELINE_DIFFERENTIAL, OUTCOME_PIPELINE_V2] as const) {
        const actual = play(mode, scenario, { prepared });
        expect(actual.results).toEqual(v1.results);
        expect(actual.record).toEqual(v1.record);
        expect(actual.notices).toEqual(v1.notices);
      }
    } else
      expect(
        compareUndirectedWinner(scenario, drawProfile.eventType !== 'TEAM', prepared).v1.results[0].success,
      ).toEqual(true);
  });
});
