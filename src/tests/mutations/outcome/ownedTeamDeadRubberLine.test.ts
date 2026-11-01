import { generateOutcomeFromScoreString } from '@Generators/simulation/generateOutcomeFromScoreString';
import { deleteNotices, setOutcomePipeline, setSubscriptions } from '@Global/state/globalState';
import { getDifferentialTally } from '@Mutate/matchUps/outcome/differential';
import { canonicalJson } from '@Tools/canonicalJson';
import { afterEach, expect, it, vi } from 'vitest';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { setClock } from '@Tools/clock';

// constants
import { OUTCOME_PIPELINE_DIFFERENTIAL, OUTCOME_PIPELINE_V1 } from '@Constants/outcomePipelineConstants';
import type { OutcomePipelineMode } from '@Constants/outcomePipelineConstants';
import { DOUBLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { POLICY_TYPE_SCORING } from '@Constants/policyConstants';
import { DEAD_RUBBER } from '@Constants/matchUpStatusConstants';
import { TEAM } from '@Constants/eventConstants';
import {
  MODIFY_DRAW_DEFINITION,
  MODIFY_MATCHUP,
  MODIFY_POSITION_ASSIGNMENTS,
  UPDATE_INCONTEXT_MATCHUP,
} from '@Constants/topicConstants';

/**
 * S7: A LINE OF A DUAL LEFT A DEAD_RUBBER PASSES THE TEAM CHECKS. A DOUBLE_ELIMINATION decider the winners' champion
 * did not need stands a DEAD_RUBBER (`direction.ts`); its lines may still be played, and `teamReason` admits the dual
 * among those its lines tally. On this decider the re-derivation that follows the line is the settle pass's (v1's).
 */
const v1Writes = vi.hoisted(() => ({ count: 0 }));
vi.mock('@Mutate/matchUps/matchUpStatus/setMatchUpState', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    setMatchUpState: (...args: any[]) => {
      v1Writes.count += 1;
      return actual.setMatchUpState(...args);
    },
  };
});

afterEach(() => {
  setOutcomePipeline(OUTCOME_PIPELINE_V1);
  setSubscriptions({ subscriptions: {} });
  setClock();
});

const TOPICS = [MODIFY_MATCHUP, MODIFY_DRAW_DEFINITION, MODIFY_POSITION_ASSIGNMENTS, UPDATE_INCONTEXT_MATCHUP];
const order = (matchUp: any) =>
  ({ Main: 0, Backdraw: 10, Decider: 20 })[matchUp.structureName as string] + matchUp.roundNumber;

/** a DOUBLE_ELIMINATION TEAM draw of 4, every dual but the decider decided for side 1 by its own call */
function prepare() {
  setOutcomePipeline(OUTCOME_PIPELINE_V1);
  setClock('2026-10-25T00:00:00.000Z');
  setSubscriptions({ subscriptions: {} });
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ eventType: TEAM, drawSize: 4, drawType: DOUBLE_ELIMINATION, drawId: 'd' }],
    // the decider holds the champion alone: its lines are scored without participants, as the TEAM arms score them
    policyDefinitions: { [POLICY_TYPE_SCORING]: { requireParticipantsForScoring: false } },
    nonRandom: 1,
    setState: true,
  });
  const duals = () =>
    tournamentEngine.allDrawMatchUps({ drawId: 'd', inContext: true, matchUpFilters: { matchUpTypes: [TEAM] } })
      .matchUps;
  for (let pass = 0; pass < 8; pass++) {
    const next = duals()
      .filter((matchUp: any) => matchUp.structureName !== 'Decider' && !matchUp.winningSide)
      .filter((matchUp: any) => matchUp.sides?.every((side: any) => side.participantId))
      .sort((a: any, b: any) => order(a) - order(b))[0];
    if (!next) break;
    const outcome = { winningSide: 1 };
    expect(tournamentEngine.setMatchUpStatus({ drawId: 'd', matchUpId: next.matchUpId, outcome }).success).toEqual(
      true,
    );
  }
  const decider = duals().find((matchUp: any) => matchUp.structureName === 'Decider');
  return { record: structuredClone(tournamentEngine.getTournament().tournamentRecord), decider };
}

function play(mode: OutcomePipelineMode, prepared: any, matchUpId: string) {
  setOutcomePipeline(OUTCOME_PIPELINE_V1);
  setSubscriptions({ subscriptions: {} });
  tournamentEngine.setState(structuredClone(prepared));
  deleteNotices();
  const notices: string[] = [];
  setSubscriptions({
    subscriptions: Object.fromEntries(
      TOPICS.map((topic) => [
        topic,
        (payloads: any[]) => payloads.forEach((payload) => notices.push(`${topic} ${canonicalJson(payload)}`)),
      ]),
    ),
  });
  setOutcomePipeline(mode);
  v1Writes.count = 0;
  setClock('2026-10-25T00:01:00.000Z');
  const outcome = generateOutcomeFromScoreString({ scoreString: '6-1 6-1', winningSide: 1 }).outcome;
  const { stack: _stack, ...result } = tournamentEngine.setMatchUpStatus({ drawId: 'd', matchUpId, outcome }) as any;
  return {
    record: canonicalJson(tournamentEngine.getTournament().tournamentRecord),
    v1Writes: v1Writes.count,
    notices,
    result,
  };
}

it("a line of a DOUBLE_ELIMINATION decider left a DEAD_RUBBER passes the TEAM checks: here the settle pass is v1's", () => {
  const { record, decider } = prepare();
  // CONTROL: the decider was not needed, and none of its lines is played
  expect(decider.matchUpStatus).toEqual(DEAD_RUBBER);
  const line = decider.tieMatchUps[0];
  const deferred = (reason: string) => getDifferentialTally()[`shadow:abstain:${reason}`]?.deferred ?? 0;
  const before = { team: deferred('team'), settle: deferred('settle') };
  const compared = play(OUTCOME_PIPELINE_DIFFERENTIAL, record, line.matchUpId);
  expect(compared.result.success).toEqual(true);
  // the line is not refused as TEAM (a dual left a DEAD_RUBBER is a dual its lines may tally); the decider's
  // re-derivation that follows is the settle pass's, v1's
  expect(deferred('team') - before.team).toEqual(0);
  expect(deferred('settle') - before.settle).toEqual(1);
});
