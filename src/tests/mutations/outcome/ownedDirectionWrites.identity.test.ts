import { generateOutcomeFromScoreString } from '@Scoring/parse/outcomeFromScoreString';
import { getTournamentRecords, setOutcomePipeline } from '@Global/state/globalState';
import { registerTestSeedIdentity } from '@Tests/testHarness/seedMathRandom';
import { toBePlayed } from '@Fixtures/scoring/outcomes/toBePlayed';
import { getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { afterEach, expect, it, vi } from 'vitest';

// constants and types
import { OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_V2 } from '@Constants/outcomePipelineConstants';
import type { Tournament } from '@Types/tournamentTypes';

const counter = vi.hoisted(() => ({ active: false, calls: 0 }));
vi.mock('@Mutate/matchUps/matchUpStatus/setMatchUpState', async (load) => {
  const actual: any = await load();
  return {
    ...actual,
    setMatchUpState: (...args: any[]) => {
      if (counter.active) counter.calls++;
      return actual.setMatchUpState(...args);
    },
  };
});

registerTestSeedIdentity('src/tests/mutations/outcome/ownedDirectionWrites.identity.test.ts', (title, ordinal) => ({
  name: 'src/tests/mutations/outcome/ownedDirectionWrites.test.ts::' + title,
  ordinal,
}));

afterEach(() => {
  counter.active = false;
  setOutcomePipeline(OUTCOME_PIPELINE_V1);
  vi.useRealTimers();
});

it.each([OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_V2] as const)(
  '%s clearing retains caller score and status-code identity in the stored record',
  (mode) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-08T12:00:00.000Z'));
    setOutcomePipeline(OUTCOME_PIPELINE_V1);
    const generated = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8 }],
      nonRandom: 1,
      setState: true,
    });
    const drawId = generated.drawIds![0];
    const record = Object.values(getTournamentRecords())[0] as Tournament;
    const draw = record.events![0].drawDefinitions![0];
    const stored = getMatchUpsMap({ drawDefinition: draw }).drawMatchUps.find(
      (matchUp) => matchUp.roundNumber === 1 && matchUp.roundPosition === 1,
    )!;
    const { outcome } = generateOutcomeFromScoreString({ scoreString: '6-1 6-1', winningSide: 1 });
    let result: any = tournamentEngine.setMatchUpStatus({ drawId, matchUpId: stored.matchUpId, outcome });
    expect(result.success).toBe(true);
    expect(stored.winningSide).toBe(1);

    const score = toBePlayed.score;
    const codes = toBePlayed.matchUpStatusCodes;
    setOutcomePipeline(mode);
    counter.calls = 0;
    counter.active = true;
    try {
      result = tournamentEngine.setMatchUpStatus({ drawId, matchUpId: stored.matchUpId, outcome: toBePlayed });
    } finally {
      counter.active = false;
    }
    expect(result.success).toBe(true);
    expect(counter.calls).toBe(mode === OUTCOME_PIPELINE_V2 ? 0 : 1);
    expect(stored.matchUpStatus).toBe(toBePlayed.matchUpStatus);
    expect(stored.score).toBe(score);
    expect(stored.matchUpStatusCodes).toBe(codes);
  },
);
