import { setOutcomePipeline, setSubscriptions } from '@Global/state/globalState';
import { registerTestSeedIdentity } from '@Tests/testHarness/seedMathRandom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { setClock } from '@Tools/clock';
import {
  exited,
  POLICY_OFF,
  R1,
  prepareUnreachedWinner,
  compareUndirectedWinner,
  UNREACHED_WINNERS,
  undirectedOutcome,
  LINKED_PRE_FEEDS,
  UNREACHED_TEAM_REFUSALS,
  UNLINKED_AD_HOC_CALLS,
} from '@Tests/testHarness/outcome/directionFixtures';

// constants and types
import { COMPLETED, DEFAULTED, WALKOVER } from '@Constants/matchUpStatusConstants';
import type { Scenario } from '@Tests/testHarness/outcome/directionFixtures';
import { OUTCOME_PIPELINE_V1 } from '@Constants/outcomePipelineConstants';
import { MISSING_ASSIGNMENTS } from '@Constants/errorConditionConstants';
import {
  ADAPTIVE,
  AD_HOC,
  FEED_IN_CHAMPIONSHIP,
  LUCKY_DRAW,
  SINGLE_ELIMINATION,
} from '@Constants/drawDefinitionConstants';

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

registerTestSeedIdentity('src/tests/mutations/outcome/ownedDirectionWrites.unreached.test.ts', (title, ordinal) => ({
  name: 'src/tests/mutations/outcome/ownedDirectionWrites.test.ts::' + title,
  ordinal,
}));

afterEach(() => {
  setOutcomePipeline(OUTCOME_PIPELINE_V1);
  setSubscriptions({ subscriptions: {} });
  setClock();
});

describe('C22 a recorded single exit awards the side that has not arrived', () => {
  it.each(UNREACHED_WINNERS)('%s', (_label, recipe, status, carry, policyOff, owned) => {
    const policyDefinitions = policyOff ? POLICY_OFF : undefined;
    const { drawProfile, prepared } = prepareUnreachedWinner(recipe, policyDefinitions);
    const [, , , , , , roundNumber, structureName, roundPosition, side] = recipe;
    const scenario: Scenario = {
      drawProfile,
      policyDefinitions,
      steps: [
        {
          target: { structureName, roundNumber, roundPosition },
          outcome: exited(status, side),
          params: { propagateExitStatus: carry },
        },
      ],
    };
    const { v1 } = compareUndirectedWinner(scenario, owned, prepared);
    expect(v1.results[0].success).toEqual(true);
  });
});

describe('C22 lucky pre-feed defers its loser link with its winner', () => {
  it.each(LINKED_PRE_FEEDS)('%s', (_label, drawSize, position, status, side, carry) => {
    const outcome = undirectedOutcome(status, side);
    const scenario: Scenario = {
      drawProfile: { drawType: ADAPTIVE, drawSize, participantsCount: drawSize },
      steps: [{ target: R1(position, 'East'), outcome, params: { propagateExitStatus: carry } }],
    };
    const owned = !carry || status === COMPLETED || status === 'bare';
    expect(compareUndirectedWinner(scenario, owned).v1.results[0].success).toEqual(true);
  });
  it.each(
    [6, 10].flatMap((size) =>
      [WALKOVER, DEFAULTED].flatMap((status) => ([1, 2] as const).map((side) => [size, status, side] as const)),
    ),
  )('C22 LUCKY_DRAW %s %s side %s remains owned without a loser link', (drawSize, status, side) => {
    const scenario: Scenario = {
      drawProfile: { drawType: LUCKY_DRAW, drawSize, participantsCount: drawSize },
      steps: [{ target: R1(1), outcome: exited(status, side) }],
    };
    expect(compareUndirectedWinner(scenario, true).v1.results[0].success).toEqual(true);
  });
});

describe('C22 the TEAM refusal prefix remains owed, while the scoring-policy override is owned', () => {
  it.each(UNREACHED_TEAM_REFUSALS)('%s', (_label, recipe, requireParticipants) => {
    const policyDefinitions = { scoring: { requireParticipantsForScoring: requireParticipants } };
    const { drawProfile, prepared } = prepareUnreachedWinner(recipe, policyDefinitions);
    const [, , , , , , roundNumber, structureName, roundPosition, emptySide] = recipe;
    const side = (emptySide === 1 ? 2 : 1) as 1 | 2;
    const scenario: Scenario = {
      drawProfile,
      policyDefinitions,
      steps: [{ target: { structureName, roundNumber, roundPosition }, outcome: { winningSide: side } }],
    };
    const { v1 } = compareUndirectedWinner(scenario, !requireParticipants, prepared);
    if (requireParticipants) {
      expect(v1.results[0].error).toEqual(MISSING_ASSIGNMENTS);
      expect(v1.record).not.toEqual(v1.recordBefore);
    } else expect(v1.results[0].success).toEqual(true);
  });
});

describe('C22 AD_HOC with no directions uses its tally scope', () => {
  it.each(UNLINKED_AD_HOC_CALLS)('%s', (_label, eventType, roundsCount, status, side) => {
    setOutcomePipeline(OUTCOME_PIPELINE_V1);
    setClock('2026-10-25T00:00:00.000Z');
    setSubscriptions({ subscriptions: {} });
    const {
      eventIds: [eventId],
    } = mocksEngine.generateTournamentRecord({
      eventProfiles: [{ eventType, participantsProfile: { participantsCount: 8 } }],
      nonRandom: 1,
      setState: true,
    });
    const generated = tournamentEngine.generateDrawDefinition({
      eventId,
      drawId: 'd',
      drawType: AD_HOC,
      automated: true,
      roundsCount,
    });
    expect(tournamentEngine.addDrawDefinition({ eventId, drawDefinition: generated.drawDefinition }).success).toEqual(
      true,
    );
    const prepared = structuredClone(tournamentEngine.getTournament().tournamentRecord);
    const outcome = undirectedOutcome(status, side);
    const scenario: Scenario = {
      drawProfile: { drawType: AD_HOC, drawSize: 8, eventType, automated: true, roundsCount },
      steps: [{ target: { roundNumber: 1, nth: 1 }, outcome }],
    };
    // The shared tally scope reconstructs assignments across every stored round.
    expect(compareUndirectedWinner(scenario, true, prepared).v1.results[0].success).toEqual(true);
  });
});

describe('C22 a bare TEAM winner with both teams present stays owned', () => {
  it.each(
    [SINGLE_ELIMINATION, FEED_IN_CHAMPIONSHIP].flatMap((type) =>
      ([1, 2] as const).map((side) => [type, side] as const),
    ),
  )('C22 TEAM %s bare winner side %s with two teams', (drawType, side) => {
    const drawProfile = { drawType, drawSize: 8, eventType: 'TEAM', tieFormatName: 'USTA_COLLEGE' };
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
    const prepared = structuredClone(tournamentEngine.getTournament().tournamentRecord);
    const scenario: Scenario = { drawProfile, steps: [{ target: R1(1, 'Main'), outcome: { winningSide: side } }] };
    expect(compareUndirectedWinner(scenario, true, prepared).v1.results[0].success).toEqual(true);
  });
});
