import { deleteNotices, setOutcomePipeline, setSubscriptions } from '@Global/state/globalState';
import { TOPICS } from '@Tests/testHarness/outcome/directionFixtures';
import { storedGraph } from '@Tests/testHarness/outcome/objectGraph';
import { afterEach, describe, expect, it } from 'vitest';
import { canonicalJson } from '@Tools/canonicalJson';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { setClock } from '@Tools/clock';

// constants and types
import type { OutcomePipelineMode } from '@Constants/outcomePipelineConstants';
import { LUCKY_DRAW } from '@Constants/drawDefinitionConstants';
import type { MatchUp } from '@Types/tournamentTypes';
import { DOUBLE_DEFAULT, DOUBLE_WALKOVER, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import {
  OUTCOME_PIPELINE_DIFFERENTIAL,
  OUTCOME_PIPELINE_V1,
  OUTCOME_PIPELINE_V2,
} from '@Constants/outcomePipelineConstants';

/**
 * A lucky draw's later rounds store no drawPositions until somebody reaches them. A double exit's advancement read
 * them as though they did, and threw after writing the double exit: a first-round double exit in a lucky draw of 7, 11
 * or 12.
 */
afterEach(() => {
  setOutcomePipeline(OUTCOME_PIPELINE_V1);
  setSubscriptions({ subscriptions: {} });
  setClock();
});

type Call = { matchUpId: string; outcome: Record<string, unknown>; params?: Record<string, unknown> };

function generate(drawSize: number, nonRandom = 1) {
  setOutcomePipeline(OUTCOME_PIPELINE_V1);
  setClock('2026-10-25T00:00:00.000Z');
  setSubscriptions({ subscriptions: {} });
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawId: 'd', drawSize, drawType: LUCKY_DRAW }],
    setState: true,
    nonRandom,
  });
}

const stored = () => structuredClone(tournamentEngine.getTournament().tournamentRecord);
const drawMatchUps = () => tournamentEngine.allDrawMatchUps({ drawId: 'd', inContext: true }).matchUps as any[];
const storedMatchUps = (record: string): MatchUp[] =>
  JSON.parse(record).events[0].drawDefinitions[0].structures[0].matchUps;

/** the call from a copy of `prepared`: its result, the record, the notices, and the stored record object for object */
function play(mode: OutcomePipelineMode, prepared: any, { matchUpId, outcome, params }: Call) {
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
  setClock('2026-10-25T00:01:00.000Z');
  const { stack: _stack, ...result }: any = tournamentEngine.setMatchUpStatus({
    outcome: structuredClone(outcome),
    drawId: 'd',
    matchUpId,
    ...params,
  });
  return {
    record: canonicalJson(tournamentEngine.getTournament().tournamentRecord),
    graph: storedGraph(result),
    result: canonicalJson(result),
    notices,
  };
}

/** v2 and the differential leave what v1 leaves */
function alike(prepared: any, call: Call, context?: string) {
  const v1 = play(OUTCOME_PIPELINE_V1, prepared, call);
  for (const mode of [OUTCOME_PIPELINE_V2, OUTCOME_PIPELINE_DIFFERENTIAL] as const) {
    const actual = play(mode, prepared, call);
    expect(actual.result, context).toEqual(v1.result);
    expect(actual.record, context).toEqual(v1.record);
    expect(actual.notices, context).toEqual(v1.notices);
    expect(actual.graph, context).toEqual(v1.graph);
  }
  return v1;
}

// 7: a BYE, every round even; 11: a BYE, an even round feeding an odd one; 12: the same without the BYE
describe.each([7, 11, 12])('LUCKY_DRAW %i: a first-round double exit', (drawSize) => {
  it.each([DOUBLE_WALKOVER, DOUBLE_DEFAULT])('%s is written, and v2 leaves what v1 leaves', (matchUpStatus) => {
    generate(drawSize);
    const prepared = stored();
    const open = drawMatchUps().filter(
      (matchUp) => matchUp.roundNumber === 1 && matchUp.matchUpStatus === TO_BE_PLAYED,
    );
    expect(open.length).toBeGreaterThan(1);
    for (const { matchUpId } of open) {
      const v1 = alike(prepared, { matchUpId, outcome: { matchUpStatus } }, `R1 ${matchUpId}`);
      expect(JSON.parse(v1.result)).toEqual({ success: true });
      const after = storedMatchUps(v1.record);
      expect(after.find((matchUp) => matchUp.matchUpId === matchUpId)?.matchUpStatus).toEqual(matchUpStatus);
    }
  });
});
