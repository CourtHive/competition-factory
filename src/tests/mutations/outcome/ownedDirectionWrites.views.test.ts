import { setOutcomePipeline, setSubscriptions } from '@Global/state/globalState';
import { getDifferentialTally } from '@Mutate/matchUps/outcome/differential';
import { registerTestSeedIdentity } from '@Tests/testHarness/seedMathRandom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import tournamentEngine from '@Engines/syncEngine';
import { setClock } from '@Tools/clock';
import {
  cleared,
  compareUndirectedWinner,
  ASSIGNMENT_VIEW_DRAWS,
  ASSIGNMENT_VIEW_CASES,
  assignmentViewFixture,
  NAMED_BYE_ADVANCE_CASES,
  prepareNamedByeAdvance,
} from '@Tests/testHarness/outcome/directionFixtures';

// constants and types
import { DOUBLE_DEFAULT, DOUBLE_WALKOVER, WALKOVER } from '@Constants/matchUpStatusConstants';
import type { Scenario } from '@Tests/testHarness/outcome/directionFixtures';
import { OUTCOME_PIPELINE_V1 } from '@Constants/outcomePipelineConstants';

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

registerTestSeedIdentity('src/tests/mutations/outcome/ownedDirectionWrites.views.test.ts', (title, ordinal) => ({
  name: 'src/tests/mutations/outcome/ownedDirectionWrites.test.ts::' + title,
  ordinal,
}));

afterEach(() => {
  setOutcomePipeline(OUTCOME_PIPELINE_V1);
  setSubscriptions({ subscriptions: {} });
  setClock();
});

describe('C26V assignment changes refresh unchanged duals and every tie line', () => {
  it.each(ASSIGNMENT_VIEW_CASES)('%s', (_label, drawType, eventType, policyOff, status, carry, sourceIndex) => {
    const { drawProfile, sources } = assignmentViewFixture(drawType, eventType, policyOff);
    const source = sources[sourceIndex];
    const prepared = structuredClone(tournamentEngine.getTournament().tournamentRecord);
    const scenario: Scenario = {
      drawProfile,
      steps: [
        {
          target: {
            structureName: source.structureName,
            roundNumber: source.roundNumber,
            roundPosition: source.roundPosition,
          },
          outcome: { matchUpStatus: status },
          params: { propagateExitStatus: carry, allowChangePropagation: true },
        },
      ],
    };
    expect(compareUndirectedWinner(scenario, true, prepared).v1.results[0].success).toEqual(true);
  });

  it.each(
    ASSIGNMENT_VIEW_DRAWS.flatMap((drawType) =>
      [false, true].flatMap((policyOff) =>
        [DOUBLE_WALKOVER, DOUBLE_DEFAULT].map(
          (status) =>
            [`C26V TEAM clear ${drawType}: ${status}, policy off ${policyOff}`, drawType, policyOff, status] as const,
        ),
      ),
    ),
  )('%s remains an explicit TEAM withdrawal obligation', (_label, drawType, policyOff, status) => {
    const { drawProfile, sources } = assignmentViewFixture(drawType, 'TEAM', policyOff);
    const source = sources[0];
    expect(
      tournamentEngine.setMatchUpStatus({
        drawId: 'd',
        matchUpId: source.matchUpId,
        outcome: { matchUpStatus: status },
        propagateExitStatus: true,
      }).success,
    ).toEqual(true);
    const prepared = structuredClone(tournamentEngine.getTournament().tournamentRecord);
    const scenario: Scenario = {
      drawProfile,
      steps: [
        {
          target: {
            structureName: source.structureName,
            roundNumber: source.roundNumber,
            roundPosition: source.roundPosition,
          },
          outcome: cleared,
          params: { propagateExitStatus: true, allowChangePropagation: true },
        },
      ],
    };
    const before = getDifferentialTally()['shadow:abstain:team']?.deferred ?? 0;
    expect(compareUndirectedWinner(scenario, false, prepared).v1.results[0].success).toEqual(true);
    expect((getDifferentialTally()['shadow:abstain:team']?.deferred ?? 0) - before).toEqual(1);
  });
});

describe('C26N a named BYE advance retains event identity through a later quiet BYE', () => {
  it.each(NAMED_BYE_ADVANCE_CASES)(
    '%s',
    (_label, eventType, policyOff, carrierWinningSide, carrierStatus, status, carry) => {
      const { drawProfile, prepared, target } = prepareNamedByeAdvance(
        eventType,
        5,
        policyOff,
        carrierStatus,
        carrierWinningSide,
      );
      const scenario: Scenario = {
        drawProfile,
        steps: [
          {
            target,
            outcome: { matchUpStatus: status },
            params: { propagateExitStatus: carry, allowChangePropagation: true },
          },
        ],
      };
      // DOUBLES 8/5 has a different occupied loser seat; its carried program is still owed.
      const owned = eventType !== 'DOUBLES';
      const before = getDifferentialTally()['shadow:abstain:exit']?.deferred ?? 0;
      expect(compareUndirectedWinner(scenario, owned, prepared).v1.results[0].success).toEqual(true);
      expect((getDifferentialTally()['shadow:abstain:exit']?.deferred ?? 0) - before).toEqual(Number(!owned));
    },
  );

  it.each(
    ['SINGLES', 'DOUBLES', 'TEAM'].flatMap((eventType) =>
      [false, true].flatMap((policyOff) =>
        ([1, 2] as const).map(
          (side) =>
            [
              `C26N carried-seat control ${eventType}, policy off ${policyOff}, side ${side}`,
              eventType,
              policyOff,
              side,
            ] as const,
        ),
      ),
    ),
  )('%s keeps its exact notice contract', (_label, eventType, policyOff, side) => {
    const { drawProfile, prepared, target } = prepareNamedByeAdvance(eventType, 8, policyOff, WALKOVER, side);
    const scenario: Scenario = {
      drawProfile,
      steps: [
        {
          target,
          outcome: { matchUpStatus: DOUBLE_WALKOVER },
          params: { propagateExitStatus: false, allowChangePropagation: true },
        },
      ],
    };
    const before = getDifferentialTally()['shadow:abstain:exit']?.deferred ?? 0;
    expect(compareUndirectedWinner(scenario, !policyOff, prepared).v1.results[0].success).toEqual(true);
    expect((getDifferentialTally()['shadow:abstain:exit']?.deferred ?? 0) - before).toEqual(Number(policyOff));
  });
});
