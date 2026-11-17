import { setOutcomePipeline, setSubscriptions } from '@Global/state/globalState';
import { registerTestSeedIdentity } from '@Tests/testHarness/seedMathRandom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { setClock } from '@Tools/clock';
import {
  won,
  cleared,
  findTarget,
  play,
  HELD_BYE_REMOVALS,
  HELD_BYE_TEAMS,
  storedLineUpFields,
} from '@Tests/testHarness/outcome/directionFixtures';

// constants and types
import type { Scenario } from '@Tests/testHarness/outcome/directionFixtures';
import { DOUBLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
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

registerTestSeedIdentity('src/tests/mutations/outcome/ownedDirectionWrites.heldByes.test.ts', (title, ordinal) => ({
  name: 'src/tests/mutations/outcome/ownedDirectionWrites.test.ts::' + title,
  ordinal,
}));

afterEach(() => {
  setOutcomePipeline(OUTCOME_PIPELINE_V1);
  setSubscriptions({ subscriptions: {} });
  setClock();
});

describe('C21 removing or relabelling a loser held beside a structural BYE', () => {
  it.each(HELD_BYE_REMOVALS)('%s', (_label, scenario, owned) => {
    const v1 = play(OUTCOME_PIPELINE_V1, scenario);
    expect(v1.results.every((result: any) => result.success)).toEqual(true);
    const compared = play(OUTCOME_PIPELINE_DIFFERENTIAL, scenario);
    const v2 = play(OUTCOME_PIPELINE_V2, scenario);
    expect(v2.v1Writes === 0).toEqual(owned);
    for (const actual of [compared, v2]) {
      expect(actual.results).toEqual(v1.results);
      expect(actual.record).toEqual(v1.record);
      expect(actual.notices).toEqual(v1.notices);
    }
  });
});

describe('C21 TEAM correction and a fresh line undoing a decided dual', () => {
  it.each(HELD_BYE_TEAMS.map((testCase) => [testCase.label, testCase] as const))(
    '%s',
    (_label, { drawProfile, target, side, action }) => {
      setOutcomePipeline(OUTCOME_PIPELINE_V1);
      setClock('2026-10-25T00:00:00.000Z');
      setSubscriptions({ subscriptions: {} });
      mocksEngine.generateTournamentRecord({
        drawProfiles: [{ ...drawProfile, drawId: 'd' }],
        nonRandom: 1,
        setState: true,
      });
      expect(
        tournamentEngine.generateLineUps({ useDefaultEventRanking: true, attach: true, drawId: 'd' }).success,
      ).toEqual(true);
      expect(
        tournamentEngine.setMatchUpStatus({
          drawId: 'd',
          matchUpId: findTarget(target),
          outcome: { winningSide: side },
        }).success,
      ).toEqual(true);
      const prepared = structuredClone(tournamentEngine.getTournament().tournamentRecord);
      let outcome: Record<string, unknown> = cleared;
      if (action === 'undecide') outcome = won(side);
      if (action === 'correct') outcome = { winningSide: side === 1 ? 2 : 1 };
      const scenario: Scenario = {
        drawProfile,
        steps: [
          {
            target: action === 'undecide' ? { ...target, singlesLine: 0 } : target,
            outcome,
          },
        ],
      };
      const v1 = play(OUTCOME_PIPELINE_V1, scenario, { prepared });
      const v1LineUpFields = storedLineUpFields();
      const compared = play(OUTCOME_PIPELINE_DIFFERENTIAL, scenario, { prepared });
      const v2 = play(OUTCOME_PIPELINE_V2, scenario, { prepared });
      expect(storedLineUpFields()).toEqual(v1LineUpFields);
      expect(v1.results.every((result: any) => result.success)).toEqual(true);
      expect(v2.v1Writes === 0).toEqual(
        action !== 'clear control' &&
          !(drawProfile.drawType === DOUBLE_ELIMINATION && drawProfile.participantsCount === 2),
      );
      for (const actual of [compared, v2]) {
        expect(actual.results).toEqual(v1.results);
        expect(actual.record).toEqual(v1.record);
        expect(actual.notices).toEqual(v1.notices);
      }
    },
  );
});
