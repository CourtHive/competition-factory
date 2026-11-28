import { setOutcomePipeline } from '@Tests/testHarness/outcomeModes';
import { authoredScenarios } from '../../testHarness/corpus/authoredSources';
import { buildOutcomeView, refuseOutcome } from '@Mutate/matchUps/outcome';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { afterEach, expect, it } from 'vitest';

// constants
import { INVALID_VALUES, MISSING_MATCHUP_ID } from '@Constants/errorConditionConstants';
import { CANCELLED } from '@Constants/matchUpStatusConstants';
import {
  OUTCOME_PIPELINE_DIFFERENTIAL,
  OUTCOME_PIPELINE_V1,
  OUTCOME_PIPELINE_V2,
} from '@Tests/testHarness/outcomeModes';

/**
 * S2a: the v2 refusals against the v1 pipeline.
 *
 * The authored
 * corpus, which asserts a result code on every step, answers identically under v1, v2 and
 * differential: v2 refuses exactly where v1 does, with the same code, and accepts the rest. And a
 * divergence is a thrown error naming the matchUp and both answers, not a silent fallback.
 */
afterEach(() => setOutcomePipeline());

it('rows 1 to 5 are decided on the request alone, before the draw is consulted', () => {
  const flags = { propagateRetirementAsExit: false };
  const view = buildOutcomeView({ request: { flags } });
  expect(refuseOutcome({ flags }, view)?.code).toEqual(MISSING_MATCHUP_ID.code);
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 4 }] });
  const drawDefinition = tournamentRecord.events[0].drawDefinitions[0];
  const matchUpId = drawDefinition.structures[0].matchUps[0].matchUpId;
  const request = { matchUpId, matchUpStatus: CANCELLED, winningSide: 1, flags } as const;
  const refusal = refuseOutcome(request, buildOutcomeView({ tournamentRecord, drawDefinition, request }));
  expect(refusal).toMatchObject({ code: INVALID_VALUES.code, row: 5 });
});

it('every authored scenario answers the same under v1, v2 and differential', () => {
  const scenarios = authoredScenarios();
  expect(scenarios.length).toBeGreaterThanOrEqual(7);
  const answers: Record<string, string[]> = {};
  for (const mode of [OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_V2, OUTCOME_PIPELINE_DIFFERENTIAL] as const) {
    setOutcomePipeline(mode);
    answers[mode] = [];
    for (const scenario of scenarios) {
      tournamentEngine.reset();
      tournamentEngine.setState(scenario.initialRecord);
      for (const directive of scenario.directives) {
        const result = tournamentEngine.executionQueue([directive]);
        answers[mode].push(`${scenario.scenarioId}: ${result.error?.code ?? 'ok'}`);
      }
    }
  }
  expect(answers[OUTCOME_PIPELINE_V1]).toEqual(
    scenarios.flatMap((s) => s.expected.map((e) => `${s.scenarioId}: ${e}`)),
  );
  expect(answers[OUTCOME_PIPELINE_V2]).toEqual(answers[OUTCOME_PIPELINE_V1]);
  expect(answers[OUTCOME_PIPELINE_DIFFERENTIAL]).toEqual(answers[OUTCOME_PIPELINE_V1]);
});
