import { captureReturn, expectReturnParity } from '@Tests/testHarness/outcome/returnParity';
import { deleteNotices, setOutcomePipeline, setSubscriptions } from '@Global/state/globalState';
import { generateOutcomeFromScoreString } from '@Scoring/parse/outcomeFromScoreString';
import * as stateWriter from '@Mutate/matchUps/matchUpStatus/setMatchUpState';
import * as recording from '@Mutate/matchUps/outcome/plan/recordedCall';
import { TOPICS } from '@Tests/testHarness/outcome/directionFixtures';
import { storedGraph } from '@Tests/testHarness/outcome/objectGraph';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { canonicalJson } from '@Tools/canonicalJson';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { createSeededRandom } from '@Tools/prng';
import { setClock } from '@Tools/clock';

// constants and types
import type { OutcomePipelineMode } from '@Constants/outcomePipelineConstants';
import { LUCKY_DRAW } from '@Constants/drawDefinitionConstants';
import type { MatchUp } from '@Types/tournamentTypes';
import {
  DEFAULTED,
  DOUBLE_DEFAULT,
  DOUBLE_WALKOVER,
  RETIRED,
  TO_BE_PLAYED,
  WALKOVER,
} from '@Constants/matchUpStatusConstants';
import {
  OUTCOME_PIPELINE_DIFFERENTIAL,
  OUTCOME_PIPELINE_V1,
  OUTCOME_PIPELINE_V2,
} from '@Constants/outcomePipelineConstants';

/**
 * A LUCKY DRAW'S DOUBLE EXIT ADVANCES NOBODY (CA, 2026-11-17). It is written on its own matchUp and produces nothing
 * in the next round, in a round of even size (whose winners go on as in any elimination draw) as in one of odd size
 * (whose advancement is chosen, `luckyDrawAdvancement`). A lucky draw's later rounds store no drawPositions until
 * somebody reaches them, and nothing reads them as though they did.
 */
afterEach(() => {
  vi.restoreAllMocks();
  setOutcomePipeline(OUTCOME_PIPELINE_V1);
  setSubscriptions({ subscriptions: {} });
  setClock();
});

type Call = { matchUpId: string; outcome: Record<string, unknown>; params?: Record<string, unknown> };

const won = (winningSide: number) => generateOutcomeFromScoreString({ scoreString: '6-1 6-1', winningSide }).outcome;

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
  const returned = captureReturn(
    tournamentEngine.setMatchUpStatus({
      outcome: structuredClone(outcome),
      drawId: 'd',
      matchUpId,
      ...params,
    }),
  );
  return {
    record: canonicalJson(tournamentEngine.getTournament().tournamentRecord),
    graph: storedGraph(returned.result),
    returned,
    result: canonicalJson(returned.result),
    notices,
  };
}

/** v2 and the differential leave what v1 leaves */
function alike(prepared: any, call: Call, context?: string, assertNative = false) {
  const writer = assertNative ? vi.spyOn(stateWriter, 'setMatchUpState') : undefined;
  const v1 = play(OUTCOME_PIPELINE_V1, prepared, call);
  if (writer) expect(writer).toHaveBeenCalled();
  for (const mode of [OUTCOME_PIPELINE_V2, OUTCOME_PIPELINE_DIFFERENTIAL] as const) {
    writer?.mockClear();
    const actual = play(mode, prepared, call);
    if (writer && mode === OUTCOME_PIPELINE_V2) expect(writer).not.toHaveBeenCalled();
    expectReturnParity(actual.returned, v1.returned, context);
    expect(actual.record, context).toEqual(v1.record);
    expect(actual.notices, context).toEqual(v1.notices);
    expect(actual.graph, context).toEqual(v1.graph);
  }
  writer?.mockRestore();
  return v1;
}

// 5 and 11: a BYE, and rounds of odd size; 7: a BYE, every round even; 8: no lucky round at all; 12: an even round
// feeding an odd one
describe.each([5, 7, 8, 11, 12])('LUCKY_DRAW %i: a first-round double exit', (drawSize) => {
  it.each([DOUBLE_WALKOVER, DOUBLE_DEFAULT])(
    '%s is written on its own matchUp and produces nothing',
    (matchUpStatus) => {
      generate(drawSize);
      const prepared = stored();
      const before = storedMatchUps(canonicalJson(prepared));
      const open = drawMatchUps().filter(
        (matchUp) => matchUp.roundNumber === 1 && matchUp.matchUpStatus === TO_BE_PLAYED,
      );
      expect(open.length).toBeGreaterThan(1);
      for (const { matchUpId } of open) {
        const v1 = alike(prepared, { matchUpId, outcome: { matchUpStatus } }, `R1 ${matchUpId}`);
        expect(JSON.parse(v1.result)).toEqual({ success: true });
        const after = storedMatchUps(v1.record);
        expect(after.find((matchUp) => matchUp.matchUpId === matchUpId)?.matchUpStatus).toEqual(matchUpStatus);
        // every other matchUp is as it was, stamp and all
        expect(after.filter((matchUp) => matchUp.matchUpId !== matchUpId)).toEqual(
          before.filter((matchUp) => matchUp.matchUpId !== matchUpId),
        );
      }
    },
  );

  it('asked again, it changes nothing; cleared, the matchUp is to be played again and nothing else moved', () => {
    generate(drawSize);
    const before = storedMatchUps(canonicalJson(stored()));
    const { matchUpId } = drawMatchUps().find(
      (matchUp) => matchUp.roundNumber === 1 && matchUp.matchUpStatus === TO_BE_PLAYED,
    );
    const doubleExit = { matchUpId, outcome: { matchUpStatus: DOUBLE_WALKOVER } };
    expect(tournamentEngine.setMatchUpStatus({ drawId: 'd', ...doubleExit }).success).toEqual(true);
    const entered = stored();
    const recorder = vi.spyOn(recording, 'recordWholeCall').mockReturnValue(undefined);
    const again = alike(entered, doubleExit, undefined, true);
    expect(recorder).not.toHaveBeenCalled();
    recorder.mockRestore();
    expect(JSON.parse(again.result)).toEqual({ success: true });
    expect(storedMatchUps(again.record)).toEqual(storedMatchUps(canonicalJson(entered)));
    const cleared = alike(entered, { matchUpId, outcome: { matchUpStatus: TO_BE_PLAYED } });
    expect(JSON.parse(cleared.result)).toEqual({ success: true });
    const after = storedMatchUps(cleared.record);
    expect(after.find((matchUp) => matchUp.matchUpId === matchUpId)?.matchUpStatus).toEqual(TO_BE_PLAYED);
    expect(after.filter((matchUp) => matchUp.matchUpId !== matchUpId)).toEqual(
      before.filter((matchUp) => matchUp.matchUpId !== matchUpId),
    );
  });
});

// a double exit stored with no `scoredTime` (an older record's, or one a failed write left): v1 stamps it when the same
// double exit is asked again, and v2 leaves what v1 leaves
it('a lucky double exit holding no scoredTime, asked again, is stamped under every pipeline', () => {
  generate(8);
  const { matchUpId } = drawMatchUps().find((matchUp) => matchUp.roundNumber === 1);
  const doubleExit = { matchUpId, outcome: { matchUpStatus: DOUBLE_WALKOVER } };
  expect(tournamentEngine.setMatchUpStatus({ drawId: 'd', ...doubleExit }).success).toEqual(true);
  const entered = stored();
  const held = entered.events[0].drawDefinitions[0].structures[0].matchUps.find(
    (matchUp: MatchUp) => matchUp.matchUpId === matchUpId,
  );
  expect(held.schedule?.scoredTime).toBeDefined();
  delete held.schedule;
  const again = alike(entered, doubleExit);
  expect(JSON.parse(again.result)).toEqual({ success: true });
  expect(
    storedMatchUps(again.record).find((matchUp) => matchUp.matchUpId === matchUpId)?.schedule?.scoredTime,
  ).toBeDefined();
});

const DOUBLE_EXITS: string[] = [DOUBLE_WALKOVER, DOUBLE_DEFAULT];

/** the statuses of the sources the matchUps' sides record an exit from, where that source was a double exit */
const producedFrom = (matchUps: MatchUp[]) =>
  matchUps
    .flatMap((matchUp) => Object.values((matchUp as any).sideExitProvenance ?? {}) as any[])
    .map((provenance) => provenance?.previousMatchUpStatus)
    .filter((status) => DOUBLE_EXITS.includes(status));

/**
 * A SEEDED WALK of a lucky draw: results, clears, single and double exits on any matchUp, each from the record v1
 * leaves before it. No call throws, v2 and the differential leave what v1 leaves, and no matchUp ever holds an exit a
 * double exit produced.
 */
describe.each([7, 8, 11, 12])('LUCKY_DRAW %i: along a seeded walk', (drawSize) => {
  it('no call throws, v2 leaves what v1 leaves, and a double exit produces nothing', () => {
    generate(drawSize, drawSize);
    const random = createSeededRandom(drawSize);
    const pick = <T>(items: T[]) => items[Math.floor(random() * items.length)];
    let record = stored();
    let doubleExits = 0;
    for (let step = 0; step < 60; step++) {
      tournamentEngine.setState(structuredClone(record));
      const matchUp = pick(drawMatchUps().filter((each) => each.matchUpStatus !== 'BYE'));
      const side = pick([1, 2]);
      const outcome = pick<Record<string, unknown>>([
        won(side),
        won(side),
        { matchUpStatus: DOUBLE_WALKOVER },
        { matchUpStatus: DOUBLE_DEFAULT },
        { matchUpStatus: DOUBLE_WALKOVER },
        { matchUpStatus: TO_BE_PLAYED, score: { scoreStringSide1: '', scoreStringSide2: '' } },
        { matchUpStatus: WALKOVER, winningSide: side },
        { matchUpStatus: DEFAULTED, winningSide: side },
        {
          ...generateOutcomeFromScoreString({ scoreString: '6-1 2-1', winningSide: side }).outcome,
          matchUpStatus: RETIRED,
        },
      ]);
      const params = random() < 0.3 ? { propagateExitStatus: true } : {};
      const call = { matchUpId: matchUp.matchUpId, outcome, params };
      const context = `step ${step}: R${matchUp.roundNumber}P${matchUp.roundPosition} ${JSON.stringify({ outcome, params }).slice(0, 120)}`;
      const v1 = alike(record, call, context);
      setOutcomePipeline(OUTCOME_PIPELINE_V1);
      tournamentEngine.setState(structuredClone(record));
      tournamentEngine.setMatchUpStatus({ drawId: 'd', ...call, ...params });
      record = stored();
      const matchUps = storedMatchUps(v1.record);
      if (matchUps.some((each) => DOUBLE_EXITS.includes(each.matchUpStatus as string))) doubleExits += 1;
      // nothing a double exit produced: no side of any matchUp records an exit that came from one
      expect(producedFrom(matchUps), context).toEqual([]);
    }
    expect(doubleExits).toBeGreaterThan(5);
  });
});

it('preserves the public error fields and diagnostic array on a refused lucky outcome', () => {
  generate(8);
  const { matchUpId } = drawMatchUps().find((matchUp) => matchUp.roundNumber === 1);
  const refused = alike(stored(), { matchUpId, outcome: { matchUpStatus: 'INVALID_STATUS' } });
  expect(refused.returned.result.error).toBeDefined();
  expect(refused.returned.arrayStack).toBe(true);
});
