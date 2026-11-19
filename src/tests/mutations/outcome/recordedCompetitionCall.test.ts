import { expectRecordedWhole, playCall, prepareCall } from '@Tests/testHarness/outcome/recordedCallHarness';
import { POLICY_COMPETITION_PRESSURE } from '@Fixtures/policies/POLICY_COMPETITION_PRESSURE';
import { setOutcomePipeline, setSubscriptions } from '@Global/state/globalState';
import { afterEach, describe, expect, it, vi } from 'vitest';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { setClock } from '@Tools/clock';

// constants
import { OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_V2 } from '@Constants/outcomePipelineConstants';
import { AD_HOC } from '@Constants/drawDefinitionConstants';
import { SINGLES_EVENT } from '@Constants/eventConstants';

// counts v1's matchUp writes on the stored record (`directionCounter.ts`: a write to a recorded call's copy is not one)
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

// CONTROL: with `refuse` set no recording is made, and the call's answer is the abstention its planners returned
const recorder = vi.hoisted(() => ({ refuse: false }));
vi.mock('@Mutate/matchUps/outcome/plan/recordedCall', async (original) => {
  const actual = await original<typeof import('@Mutate/matchUps/outcome/plan/recordedCall')>();
  const recordWholeCall: typeof actual.recordWholeCall = (args) =>
    recorder.refuse ? undefined : actual.recordWholeCall(args);
  return { ...actual, recordWholeCall };
});

afterEach(() => {
  recorder.refuse = false;
  setOutcomePipeline(OUTCOME_PIPELINE_V1);
  setSubscriptions({ subscriptions: {} });
  setClock();
});

/**
 * A RESULT UNDER A PER-MATCHUP COMPETITION POLICY IS RECORDED WHOLE (`competition`, `outcome/plan.ts`
 * `RECORDED_WHOLE`).
 *
 * Where a competition policy is processed per matchUp, v1's score write brings the draw's stored competition state up
 * to date (`processCompetitionMatchUp`: the state re-derived from every result of the draw, ratings and their history
 * among it) and announces the draw for it (`announceDrawChange`). The state is the draw's own field
 * (`competitionState`, or its extension), so it is in the recording: `replaceDrawState`, and the draw notice among the
 * recorded notices. Nothing is written outside the draw.
 */

const MATCH_UP_FORMAT = 'SET1-S:6/TB7';
const won = (winningSide: 1 | 2) =>
  mocksEngine.generateOutcomeFromScoreString({ matchUpFormat: MATCH_UP_FORMAT, scoreString: '6-1', winningSide })
    .outcome;

/** an ad hoc draw under the pressure policy, its first round drawn, and the results entered before the call */
const competition = (before: (1 | 2)[], call: 1 | 2) => () => {
  mocksEngine.generateTournamentRecord({
    participantsProfile: { idPrefix: 'P', participantsCount: 8 },
    drawProfiles: [
      {
        matchUpFormat: MATCH_UP_FORMAT,
        eventType: SINGLES_EVENT,
        automated: false,
        drawType: AD_HOC,
        drawSize: 8,
        drawId: 'd',
      },
    ],
    nonRandom: 1,
    setState: true,
  });
  tournamentEngine.attachPolicies({ drawId: 'd', policyDefinitions: POLICY_COMPETITION_PRESSURE });
  const participantIds = tournamentEngine.getParticipants().participants.map((p: any) => p.participantId);
  expect(tournamentEngine.initializeCompetitionState({ drawId: 'd', participantIds }).success).toEqual(true);
  const drawn: any = tournamentEngine.drawMatic({ drawId: 'd' });
  const { structureId } = tournamentEngine.getEvent({ drawId: 'd' }).drawDefinition.structures[0];
  tournamentEngine.addAdHocMatchUps({ matchUps: drawn.matchUps, structureId, drawId: 'd' });
  const { matchUpId } = tournamentEngine.allTournamentMatchUps({ matchUpFilters: { drawIds: ['d'] } }).matchUps[0];
  for (const winningSide of before)
    expect(tournamentEngine.setMatchUpStatus({ drawId: 'd', matchUpId, outcome: won(winningSide) }).success).toEqual(
      true,
    );
  return { drawId: 'd', matchUpId, outcome: won(call) };
};

const states = (record: string) =>
  JSON.stringify(
    JSON.parse(record).events[0].drawDefinitions[0].competitionState ??
      JSON.parse(record).events[0].drawDefinitions[0].extensions,
  );

describe('a result under a per-matchUp competition policy is recorded whole', () => {
  it.each([
    ['a first result', [], 1],
    ['a result entered again', [1], 1],
    ['a result corrected to the other side', [1], 2],
  ] as [string, (1 | 2)[], 1 | 2][])('%s', (_label, before, call) => {
    const prepared = prepareCall(competition(before, call));
    const v1 = expectRecordedWhole(prepared, 'competition', recorder);
    // CONTROL: v1's write changed the stored competition state
    expect(states(v1.record)).not.toEqual(states(JSON.stringify(prepared.prepared)));
    // ...and v2 leaves the state v1 leaves
    expect(states(playCall(OUTCOME_PIPELINE_V2, prepared).record)).toEqual(states(v1.record));
  });
});
