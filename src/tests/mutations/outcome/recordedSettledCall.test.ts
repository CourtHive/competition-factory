import { addNotice, deleteNotices, setOutcomePipeline, setSubscriptions } from '@Global/state/globalState';
import { setMatchUpStatus } from '@Mutate/matchUps/matchUpStatus/setMatchUpStatus';
import { getDifferentialTally } from '@Mutate/matchUps/outcome/differential';
import { v1Writes } from '@Tests/testHarness/outcome/directionCounter';
import { objectGraph } from '@Tests/testHarness/outcome/objectGraph';
import { toBePlayed } from '@Fixtures/scoring/outcomes/toBePlayed';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { canonicalJson } from '@Tools/canonicalJson';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { nowIso, setClock } from '@Tools/clock';
import { randomSource } from '@Tools/prng';
import {
  expectPlayedParity,
  expectRecordedWhole,
  playCall,
  prepareCall,
} from '@Tests/testHarness/outcome/recordedCallHarness';

// constants and types
import { CONSOLATION, FIRST_MATCH_LOSER_CONSOLATION, MAIN, QUALIFYING } from '@Constants/drawDefinitionConstants';
import type { RecordedCall } from '@Tests/testHarness/outcome/recordedCallHarness';
import type { OutcomePipelineMode } from '@Constants/outcomePipelineConstants';
import { COMPLETED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';
import type { AbstainReason } from '@Mutate/matchUps/outcome/types';
import { DOMINANT_DUO } from '@Constants/tieFormatConstants';
import { MODIFY_MATCHUP } from '@Constants/topicConstants';
import type { Tournament } from '@Types/tournamentTypes';
import { TEAM_MATCHUP } from '@Constants/matchUpTypes';
import { TEAM_EVENT } from '@Constants/eventConstants';
import {
  OUTCOME_PIPELINE_DIFFERENTIAL,
  OUTCOME_PIPELINE_V1,
  OUTCOME_PIPELINE_V2,
} from '@Constants/outcomePipelineConstants';

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

/**
 * the settle runs made on a copy of the record, in their order: v1's own, inside its run, then the recorder's proof
 * (`settledOnCopy`). FAULT: with `fault` set, the proof's run (the second on a copy) is made to do what a pass with
 * work does, after the passes themselves have run
 */
type Fault = 'a notice' | 'a field' | 'a stamp' | 'the bound' | 'an error' | 'a random draw' | 'a clock read';
const settle = vi.hoisted(() => ({ onCopy: 0, noticed: [] as number[], fault: undefined as Fault | undefined }));
vi.mock('@Mutate/matchUps/matchUpStatus/settleAfterWrite', async (original) => {
  const actual = await original<typeof import('@Mutate/matchUps/matchUpStatus/settleAfterWrite')>();
  const { getNoticeBuffer } = await import('@Global/state/globalState');
  const { inDraftWrites } = await import('@Global/state/withDraftWrites');
  const settleAfterWrite: typeof actual.settleAfterWrite = (args) => {
    if (!inDraftWrites()) return actual.settleAfterWrite(args);
    settle.onCopy += 1;
    const buffered = (getNoticeBuffer() ?? []).length;
    const result = actual.settleAfterWrite(args);
    settle.noticed.push((getNoticeBuffer() ?? []).length - buffered);
    if (settle.onCopy !== 2 || !settle.fault) return result;
    const matchUp: any = args.matchUpsMap.drawMatchUps[0];
    if (settle.fault === 'a notice') addNotice({ topic: MODIFY_MATCHUP, key: 'fault', payload: { fault: true } });
    if (settle.fault === 'a field') matchUp.notes = 'written by the second settle';
    if (settle.fault === 'a stamp') matchUp.updatedAt = '2030-01-01T00:00:00.000Z';
    if (settle.fault === 'the bound') return { ...result, exhausted: matchUp.matchUpId };
    if (settle.fault === 'an error') return { error: { code: 'ERR_FAULT', message: 'forced by the test' } } as any;
    if (settle.fault === 'a random draw') randomSource()();
    if (settle.fault === 'a clock read') nowIso();
    return result;
  };
  return { ...actual, settleAfterWrite };
});

/**
 * A RECORDING A SETTLE PREDICATE FINDS WORK ON IS KEPT ONLY WHERE THE PASSES THEMSELVES FIND NONE
 * (`outcome/plan/recordedCall.ts` `settledOnCopy`; exploratory, awaiting a ruling).
 *
 * A whole-call recording is v1's write as its own settle passes left it. A has-work predicate that still finds work
 * on it dropped the recording, and the call stayed v1's. The predicates approximate the passes, so the passes are
 * asked: they run once more on the copy, and the recording is kept only if that run changes nothing at all (no field,
 * no stamp, no notice, no warning, no read of the clock or of the random source).
 *
 * What that proves, family by family (the batch 5 ledger's settle family):
 *
 * - `reconcileLinkAdvancements` found work the pass does not have (a qualifier's removal held back by play
 *   downstream; a TEAM line in a FIRST_MATCH_LOSER_CONSOLATION): the second run changes nothing, and the call is v2's.
 * - `settleHeldExits` found work the pass DOES have (a DOUBLE_ELIMINATION Main final converged, its Decider a BYE):
 *   asked again, the pass announces the Decider it writes over itself. That is a change, the recording is dropped, and
 *   the call stays v1's, as before: the FAULT rows here stand for it (`aSettledByeTargetIsNotProducedAgain.test.ts`
 *   has the draws themselves, where that pass is corrected).
 */

afterEach(() => {
  recorder.refuse = false;
  settle.fault = undefined;
  setOutcomePipeline(OUTCOME_PIPELINE_V1);
  setSubscriptions({ subscriptions: {} });
  deleteNotices();
  setClock();
});

const matchUps = () => tournamentEngine.allDrawMatchUps({ drawId: 'd', inContext: true }).matchUps as any[];
const won = (winningSide: number, scoreString = '6-1 6-1') =>
  mocksEngine.generateOutcomeFromScoreString({ scoreString, winningSide }).outcome;
const score = (params: Record<string, unknown>) =>
  expect(tournamentEngine.setMatchUpStatus({ drawId: 'd', ...params }).success, JSON.stringify(params)).toEqual(true);

/** `link`: a qualifier placed in the main draw has played there; the qualifying final is cleared, its removal asked */
function qualifierHeldBack() {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        qualifyingProfiles: [{ roundTarget: 1, structureProfiles: [{ drawSize: 8, qualifyingPositions: 2 }] }],
        drawSize: 16,
        drawId: 'd',
      },
    ],
    nonRandom: 1,
    setState: true,
  });
  const { drawDefinition } = tournamentEngine.getEvent({ drawId: 'd' });
  const { structureId } = drawDefinition.structures.find(({ stage }: any) => stage === QUALIFYING);
  for (;;) {
    const ready = matchUps().filter((matchUp) => matchUp.structureId === structureId && matchUp.readyToScore);
    if (!ready.length) break;
    for (const { matchUpId } of ready) score({ matchUpId, outcome: won(1) });
  }
  const final = matchUps().find(
    (m) => m.structureId === structureId && m.finishingRound === 1 && m.matchUpStatus === COMPLETED,
  );
  const { matchUpId } = final;
  score({ matchUpId, outcome: structuredClone(toBePlayed) });
  score({
    policyDefinitions: { [POLICY_TYPE_PROGRESSION]: { autoPlaceQualifiers: true } },
    outcome: won(1, '6-2 6-2'),
    matchUpId,
  });
  const placed = matchUps().find((m) => m.matchUpId === matchUpId);
  const qualifier = placed.sides.find((side: any) => side.sideNumber === placed.winningSide).participantId;
  const main = matchUps().find(
    (m) => m.stage === MAIN && m.sides.some((side: any) => side.participantId === qualifier),
  );
  expect(main.readyToScore).toEqual(true);
  score({ matchUpId: main.matchUpId, outcome: won(1) });
  return {
    policyDefinitions: { [POLICY_TYPE_PROGRESSION]: { autoRemoveQualifiers: true } },
    outcome: structuredClone(toBePlayed),
    drawId: 'd',
    matchUpId,
  };
}

/** `team`: a dual won by WALKOVER, its winner fed to the consolation on losing; a line of the WALKOVER dual is scored */
function walkoverDualLine() {
  const {
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawType: FIRST_MATCH_LOSER_CONSOLATION,
        tieFormatName: DOMINANT_DUO,
        eventType: TEAM_EVENT,
        drawSize: 8,
        drawId: 'd',
      },
    ],
    nonRandom: 1,
    setState: true,
  });
  expect(
    tournamentEngine.generateLineUps({ useDefaultEventRanking: true, attach: true, drawId: 'd', eventId }).success,
  ).toEqual(true);
  const duals = (stage: string, roundNumber: number) =>
    matchUps().filter((m) => m.matchUpType === TEAM_MATCHUP && m.stage === stage && m.roundNumber === roundNumber);
  const rubbers = (matchUpId: string) => matchUps().filter((m) => m.matchUpTieId === matchUpId);
  const rubberOutcome = (rubber: any, winningSide: number) =>
    won(winningSide, rubber.matchUpFormat.startsWith('SET3') ? '6-1 6-1' : '8-1');
  const playDual = (matchUpId: string, winningSide: number) => {
    for (const rubber of rubbers(matchUpId))
      score({ matchUpId: rubber.matchUpId, outcome: rubberOutcome(rubber, winningSide) });
  };
  const [walkoverDual, ...scored] = duals(MAIN, 1);
  score({ matchUpId: walkoverDual.matchUpId, outcome: { matchUpStatus: WALKOVER, winningSide: 1 } });
  for (const dual of scored) playDual(dual.matchUpId, 1);
  const drawPosition = walkoverDual.drawPositions[0];
  const next = duals(MAIN, 2).find((m) => m.drawPositions?.includes(drawPosition));
  const side = next.sides.find((s: any) => s.drawPosition === drawPosition);
  playDual(next.matchUpId, 3 - side.sideNumber);
  // CONTROL: the WALKOVER's winner, having lost its first played dual, stands in the consolation
  expect(duals(CONSOLATION, 2).some((m) => m.sides.some((s: any) => s.participantId === side.participantId))).toEqual(
    true,
  );
  const [line] = rubbers(walkoverDual.matchUpId);
  return { drawId: 'd', matchUpId: line.matchUpId, outcome: rubberOutcome(line, 1) };
}

const tally = (key: string) => {
  const entry = getDifferentialTally()[key];
  return (entry?.compared ?? 0) + (entry?.deferred ?? 0);
};

describe('a recording a settle predicate finds work on, where the passes themselves find none, is v2s', () => {
  const PROVED: [string, AbstainReason, () => Record<string, unknown>][] = [
    ['a qualifier whose removal play downstream holds back', 'link', qualifierHeldBack],
  ];

  // CA, 2026-11-20 (class 4): a dual decided by its own exit keeps its winner while its lines project none. The line no
  // longer un-decides the WALKOVER dual, so nothing is taken back from the consolation, no settle predicate finds work on
  // v1's write, and the recording is kept without the proof: v1's own settle is the only run on a copy. (Before the
  // ruling this row stood in PROVED, and in the FAULT rows below, as the TEAM line in a FIRST_MATCH_LOSER_CONSOLATION.)
  it('a line scored in a dual won by WALKOVER, its winner already fed on, keeps the dual and needs no proof (team)', () => {
    const call = prepareCall(walkoverDualLine);
    expectRecordedWhole(call, 'team', recorder);
    settle.onCopy = 0;
    expect(playCall(OUTCOME_PIPELINE_V2, call).v1Writes).toEqual(0);
    expect(settle.onCopy).toEqual(1);
    const line = matchUps().find((m) => m.matchUpId === call.params.matchUpId);
    const dual = matchUps().find((m) => m.matchUpId === line.matchUpTieId);
    expect([dual.matchUpStatus, dual.winningSide]).toEqual([WALKOVER, 1]);
  });

  it.each(PROVED)('%s (%s)', (_label, reason, build) => {
    const call = prepareCall(build);
    expectRecordedWhole(call, reason, recorder);
    // the proof was asked for, and its run buffered nothing: v1's settle on the copy, then the passes once more
    settle.onCopy = 0;
    settle.noticed = [];
    expect(playCall(OUTCOME_PIPELINE_V2, call).v1Writes).toEqual(0);
    expect(settle.onCopy).toEqual(2);
    expect(settle.noticed[1]).toEqual(0);
  });

  // FAULT: whatever the second settle does, the recording is dropped and the call is v1's, as it was
  const FAULTS: Fault[] = ['a notice', 'a field', 'a stamp', 'the bound', 'an error', 'a random draw'];
  it.each(PROVED.flatMap(([label, reason, build]) => FAULTS.map((fault) => [fault, label, reason, build] as const)))(
    'CONTROL, the second settle makes %s: %s stays v1s',
    (fault, _label, reason, build) => {
      const call = prepareCall(build);
      const v1 = playCall(OUTCOME_PIPELINE_V1, call);
      const before = { abstained: tally(`shadow:abstain:${reason}`), applied: tally('shadow:applied') };
      for (const mode of [OUTCOME_PIPELINE_DIFFERENTIAL, OUTCOME_PIPELINE_V2] as const) {
        settle.onCopy = 0;
        settle.fault = fault;
        const actual = playCall(mode, call);
        settle.fault = undefined;
        expect(settle.onCopy).toEqual(2);
        expect(actual.v1Writes).toBeGreaterThan(0);
        expectPlayedParity(actual, v1);
      }
      expect({ abstained: tally(`shadow:abstain:${reason}`), applied: tally('shadow:applied') }).toEqual({
        abstained: before.abstained + 1,
        applied: before.applied,
      });
    },
  );
});

describe('the proof reads neither source: v1 on the stored record is handed the instants its copy read', () => {
  const EPOCH = Date.parse('2026-11-18T00:00:00.000Z');

  /** the call made directly, outside every engine, the source advancing 100 ms at each read */
  function direct(mode: OutcomePipelineMode, { prepared, params }: RecordedCall) {
    const roots: Tournament = structuredClone(prepared);
    const event = roots.events?.[0] as NonNullable<Tournament['events']>[number];
    const drawDefinition = event.drawDefinitions?.[0] as any;
    setSubscriptions({ subscriptions: {} });
    deleteNotices();
    let reads = 0;
    setClock(() => EPOCH + ++reads * 100);
    setOutcomePipeline(mode);
    v1Writes.count = 0;
    let returned: any;
    let thrown: string | undefined;
    try {
      returned = setMatchUpStatus({
        ...structuredClone(params),
        tournamentRecord: roots,
        drawDefinition,
        event,
      } as any);
    } catch (error) {
      thrown = String(error);
    }
    setOutcomePipeline(OUTCOME_PIPELINE_V1);
    setClock('2026-10-25T00:02:00.000Z');
    const { stack: _stack, ...result } = returned ?? {};
    return {
      graph: objectGraph([roots, result]),
      record: canonicalJson(roots),
      v1Writes: v1Writes.count,
      thrown,
      result,
      reads,
    };
  }

  it('a call with no captured instant, proved settled, stamps what v1 stamps and reads the source as often', () => {
    const call = prepareCall(qualifierHeldBack);
    const v1 = direct(OUTCOME_PIPELINE_V1, call);
    expect(v1.result.success, JSON.stringify(v1.result)).toEqual(true);
    expect(v1.reads).toBeGreaterThan(1);
    settle.onCopy = 0;
    const v2 = direct(OUTCOME_PIPELINE_V2, call);
    expect(settle.onCopy).toEqual(2);
    expect(v2.v1Writes).toEqual(0);
    // differential's own check: v1's run on the stored record read the clock exactly as its copy did
    const compared = direct(OUTCOME_PIPELINE_DIFFERENTIAL, call);
    for (const actual of [v2, compared]) expect({ ...actual, v1Writes: 0 }).toEqual({ ...v1, v1Writes: 0 });
  });

  it.each(['a clock read', 'a random draw'] as Fault[])(
    'CONTROL: a second settle that makes %s is not handed the source, and the call stays v1s at v1s instants',
    (fault) => {
      const call = prepareCall(qualifierHeldBack);
      const v1 = direct(OUTCOME_PIPELINE_V1, call);
      for (const mode of [OUTCOME_PIPELINE_V2, OUTCOME_PIPELINE_DIFFERENTIAL] as const) {
        settle.onCopy = 0;
        settle.fault = fault;
        const actual = direct(mode, call);
        settle.fault = undefined;
        expect(settle.onCopy).toEqual(2);
        expect(actual.v1Writes).toBeGreaterThan(0);
        // the same reads, the same instants: the proof's read took nothing from the source
        expect({ ...actual, v1Writes: 0 }).toEqual({ ...v1, v1Writes: 0 });
      }
    },
  );
});
