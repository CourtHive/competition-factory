import type { Notice } from '@Global/state/globalState';
import asyncEngine from '@Engines/asyncEngine';
import asyncProvider from '@Server/providers/factory/engines/asyncGlobalState';
import { inDraftWrites } from '@Global/state/withDraftWrites';
import * as governors from '@Assemblies/governors';
import type { MatchUp, Tournament } from '@Types/tournamentTypes';
import * as whole from '@Mutate/matchUps/outcome/plan/recordedCall';
import * as passage from '@Mutate/matchUps/outcome/plan/forwardByePassage';
import { getProvider, setOutcomePipeline, setStateProvider, setSubscriptions } from '@Global/state/globalState';
import { replaceWithBye } from '@Tests/mutations/drawDefinitions/testingUtilities';
import { compareHeldClaims } from '@Tests/testHarness/outcome/compareHeldClaims';
import { playCall, prepareCall } from '@Tests/testHarness/outcome/recordedCallHarness';
import syncGlobalState from '@Global/state/syncGlobalState';
import * as noticeIdentity from '@Global/state/noticeIdentity';
import { objectGraph } from '@Tests/testHarness/outcome/objectGraph';
import * as nestedRecorder from '@Mutate/matchUps/outcome/plan/recordedCascade';
import { setClock } from '@Tools/clock';
import mocksEngine from '@Assemblies/engines/mock';
import engine from '@Engines/syncEngine';
import { afterEach, expect, it, vi } from 'vitest';

import {
  DOUBLE_ELIMINATION,
  FIRST_MATCH_LOSER_CONSOLATION,
  FIRST_ROUND_LOSER_CONSOLATION,
  MAIN,
  CONSOLATION,
} from '@Constants/drawDefinitionConstants';
import { COMPLETED, DOUBLE_DEFAULT, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { POLICY_TYPE_FEED_IN, POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';

afterEach(() => {
  vi.restoreAllMocks();
  setOutcomePipeline('v1');
  setSubscriptions({ subscriptions: {} });
  setClock();
});

function structuralBye() {
  const {
    drawIds: [drawId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: FIRST_MATCH_LOSER_CONSOLATION, drawSize: 4 }],
    policyDefinitions: { [POLICY_TYPE_FEED_IN]: { feedFromMainFinal: true } },
    nonRandom: 711,
  });
  engine.setState(tournamentRecord);
  const structureId = engine.getEvent({ drawId }).drawDefinition.structures[0].structureId;
  for (const drawPosition of [1, 2]) replaceWithBye({ drawId, structureId, drawPosition });
  const { upcomingMatchUps } = engine.drawMatchUps({ drawId });
  const { outcome } = mocksEngine.generateOutcomeFromScoreString({ scoreString: '7-5 7-5', winningSide: 1 });
  return { drawId, matchUpId: upcomingMatchUps[0].matchUpId, outcome };
}

function reservedBye() {
  const {
    drawIds: [drawId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: FIRST_ROUND_LOSER_CONSOLATION, drawSize: 8 }],
    policyDefinitions: { [POLICY_TYPE_PROGRESSION]: { propagateExitStatus: true } },
    nonRandom: 712,
  });
  engine.setState(tournamentRecord);
  const matches = () => engine.allTournamentMatchUps().matchUps;
  for (const roundPosition of [1, 2]) {
    const match = matches().find((m) => m.stage === MAIN && m.roundNumber === 1 && m.roundPosition === roundPosition)!;
    expect(
      engine.setMatchUpStatus({ drawId, matchUpId: match.matchUpId, outcome: { matchUpStatus: DOUBLE_DEFAULT } })
        .success,
    ).toBe(true);
  }
  const { outcome } = mocksEngine.generateOutcomeFromScoreString({ scoreString: '6-1 6-1', winningSide: 1 });
  for (const roundPosition of [3, 4]) {
    const match = matches().find((m) => m.stage === MAIN && m.roundNumber === 1 && m.roundPosition === roundPosition)!;
    expect(engine.setMatchUpStatus({ drawId, matchUpId: match.matchUpId, outcome }).success).toBe(true);
  }
  const meet = matches().find((m) => m.stage === CONSOLATION && m.roundNumber === 1 && m.roundPosition === 2)!;
  expect(meet.matchUpStatus).toBe(TO_BE_PLAYED);
  expect(meet.sides?.every((s) => s.participantId)).toBe(true);
  const receiver = matches().find((m) => m.matchUpId === meet.winnerMatchUpId)!;
  const structure = engine
    .getEvent({ drawId })
    .drawDefinition.structures.find((s) => s.structureId === meet.structureId)!;
  expect(
    structure.positionAssignments.some((a) => a.byeFromPropagation && receiver.drawPositions?.includes(a.drawPosition)),
  ).toBe(true);
  return { drawId, matchUpId: meet.matchUpId, outcome: { ...outcome, matchUpStatus: COMPLETED } };
}

it.each([
  ['structural', structuralBye],
  ['reserved', reservedBye],
] as const)('advances a winner through a %s BYE with both recorders disabled', (_, build) => {
  const call = prepareCall(build);
  const nested = vi.spyOn(nestedRecorder, 'recordDoubleExitCascade').mockReturnValue(undefined);
  compareHeldClaims(call, true);
  expect(nested).not.toHaveBeenCalled();
});

it.each([
  ['structural', structuralBye],
  ['reserved', reservedBye],
] as const)('sends each %s passage notice to the provider at the original write boundary', (_, build) => {
  const call = prepareCall(build);
  const append = noticeIdentity.appendNotice;
  const enqueued: string[] = [];
  // Observe inside the installed sync provider without replacing its addNotice implementation.
  vi.spyOn(noticeIdentity, 'appendNotice').mockImplementation((state, notice, subscribed) => {
    // Serialize here. Later writes can change the aliased draw or match in an earlier payload.
    enqueued.push(
      String(inDraftWrites()),
      JSON.stringify(objectGraph(notice), (_, value) => (typeof value === 'function' ? '<function>' : value)),
    );
    return append(state, notice, subscribed);
  });
  const predict = vi.spyOn(passage, 'predictForwardByePassage').mockReturnValue({ abstain: 'control' });
  playCall('v2', call);
  predict.mockRestore();
  const original = enqueued.splice(0);
  expect(original.length).toBeGreaterThan(0);
  playCall('v2', call);
  expect(enqueued).toHaveLength(original.length);
  expect(enqueued).toEqual(original);
});

it('retains recorded settlement when the winner and loser paths meet in double elimination', () => {
  const call = prepareCall(() => {
    const {
      drawIds: [drawId],
      tournamentRecord,
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawType: DOUBLE_ELIMINATION, drawSize: 8, participantsCount: 2 }],
      nonRandom: 1,
    });
    engine.setState(tournamentRecord);
    const mainFinal = engine
      .allDrawMatchUps({ drawId, inContext: true })
      .matchUps.find((m) => m.structureName === 'Main' && m.roundNumber === 3 && m.roundPosition === 1)!;
    return { drawId, matchUpId: mainFinal.matchUpId, outcome: { winningSide: 1 } };
  });
  compareHeldClaims(call, false);
});

it('keeps an exit-fed BYE on the recorder when its reservation marker is missing', () => {
  const call = prepareCall(reservedBye);
  const draw = call.prepared
    .events!.flatMap((event) => event.drawDefinitions ?? [])
    .find((draw) => draw.drawId === call.params.drawId)!;
  const sourceStructure = draw.structures!.find((structure) =>
    structure.matchUps?.some((match) => match.matchUpId === call.params.matchUpId),
  )!;
  const source = sourceStructure.matchUps!.find((match) => match.matchUpId === call.params.matchUpId)!;
  const receiver = sourceStructure.matchUps!.find((match) => match.matchUpId === source.winnerMatchUpId)!;
  const seat = sourceStructure.positionAssignments!.find(
    (assignment) => assignment.byeFromPropagation && receiver.drawPositions?.includes(assignment.drawPosition),
  )!;
  expect(seat.bye).toBe(true);
  delete seat.byeFromPropagation;
  compareHeldClaims(call, false);
});

it('preserves observed notice writes on the native route', () => {
  const call = prepareCall(reservedBye);
  const original = getProvider();
  const addNotice = vi.fn(original.addNotice.bind(original));
  try {
    setStateProvider({ ...original, addNotice });
    compareHeldClaims(call, true);
    expect(addNotice).toHaveBeenCalled();
  } finally {
    setStateProvider(original);
  }
});

it('admits a passage when a provider replaces addNotice after installation', () => {
  const call = prepareCall(reservedBye);
  const original = getProvider();
  const provider = { ...syncGlobalState };
  setStateProvider(provider);
  try {
    provider.addNotice = vi.fn(syncGlobalState.addNotice);
    compareHeldClaims(call, true);
    expect(provider.addNotice).toHaveBeenCalled();
  } finally {
    setStateProvider(original);
  }
});

it('keeps the async request’s ordered modified topics and its draft and live notice keys', async () => {
  const call = prepareCall(reservedBye);
  const previous = getProvider();
  setStateProvider(asyncProvider);
  try {
    const play = () =>
      asyncProvider.runWithInstanceState(async () => {
        asyncEngine.importMethods(governors);
        setOutcomePipeline('v1');
        await asyncEngine.setState(structuredClone(call.prepared));
        setSubscriptions({ subscriptions: { modifyMatchUp: () => undefined, modifyDrawDefinition: () => undefined } });
        setOutcomePipeline('v2');
        const notices: unknown[] = [];
        const topics: string[][] = [];
        const add = asyncProvider.addNotice;
        const cycle = asyncProvider.cycleModifiedTopics;
        const addSpy = vi.spyOn(asyncProvider, 'addNotice').mockImplementation((notice, global) => {
          notices.push([inDraftWrites(), notice.topic, notice.key, objectGraph(notice.payload)]);
          return add(notice, global);
        });
        const cycleSpy = vi.spyOn(asyncProvider, 'cycleModifiedTopics').mockImplementation(() => {
          const value = cycle();
          topics.push([...value]);
          return value;
        });
        try {
          const result = await asyncEngine.setMatchUpStatus(structuredClone(call.params));
          expect(result.success).toBe(true);
          return { notices, topics };
        } finally {
          addSpy.mockRestore();
          cycleSpy.mockRestore();
        }
      });
    const predict = vi.spyOn(passage, 'predictForwardByePassage').mockReturnValue({ abstain: 'control' });
    const recorded = await play();
    predict.mockRestore();
    const native = await play();
    expect(native).toStrictEqual(recorded);
    expect(native.topics.at(-1)).toContain('modifyMatchUp');
    expect(native.notices.length).toBeGreaterThan(0);
  } finally {
    setStateProvider(previous);
  }
});

it.each([
  'stale time in a stamp getter',
  'live edit during a pre-stamped draft',
  'reference from outside the draw',
] as const)('matches recorded notice entry bytes and stored identities for a %s', (intervention) => {
  const call = prepareCall(reservedBye);
  const original = getProvider();
  const predict = passage.predictForwardByePassage;
  const planner = vi.spyOn(passage, 'predictForwardByePassage');
  const recorder = vi.spyOn(whole, 'recordWholeCall');
  const stored = () => (Object.values(original.getTournamentRecords())[0] as Tournament).events![0].drawDefinitions![0];
  let armed = false;
  let sampled = false;
  let edited = false;
  let bytes: string[] = [];
  const run = (native: boolean) => {
    armed = sampled = edited = false;
    bytes = [];
    recorder.mockClear();
    planner.mockImplementationOnce((args) => {
      armed = true;
      return native ? predict(args) : { abstain: 'recorded control' };
    });
    const actual = playCall('v2', call);
    expect(sampled && edited).toBe(true);
    const keepsParent = intervention === 'live edit during a pre-stamped draft';
    expect(recorder).toHaveBeenCalledTimes(native && keepsParent ? 0 : 1);
    if (keepsParent) expect(stored().notes).toBe('independent live edit');
    return { actual, bytes };
  };
  try {
    setStateProvider({
      ...original,
      getCapturedStamps() {
        const stamps = original.getCapturedStamps?.();
        if (armed && !sampled && stamps) {
          sampled = true;
          const draw = stored();
          if (intervention === 'live edit during a pre-stamped draft') {
            stamps.add(draw);
          } else if (intervention === 'reference from outside the draw') {
            const record = Object.values(original.getTournamentRecords())[0] as Tournament & { relatedMatch?: MatchUp };
            record.relatedMatch = draw
              .structures!.flatMap((s) => s.matchUps ?? [])
              .find((m) => m.matchUpId === call.params.matchUpId);
            expect(record.relatedMatch).toBeDefined();
            edited = true;
          } else {
            const source = draw
              .structures!.flatMap((s) => s.matchUps ?? [])
              .find((m) => m.matchUpId === call.params.matchUpId)!;
            const match = draw
              .structures!.flatMap((s) => s.matchUps ?? [])
              .find(
                (m) =>
                  m.matchUpId !== source.matchUpId &&
                  m.matchUpId !== source.winnerMatchUpId &&
                  m.matchUpId !== source.loserMatchUpId &&
                  m.matchUpStatus === TO_BE_PLAYED,
              )!;
            expect(match).toBeDefined();
            (match.schedule ??= {}).scoredTime = '2030-01-01T00:00:00.000Z';
            edited = true;
          }
        }
        return stamps;
      },
      addNotice(notice: Notice, settings?: boolean) {
        if (armed) {
          const draw = stored();
          if (!edited && inDraftWrites() && intervention === 'live edit during a pre-stamped draft') {
            edited = true;
            draw.notes = 'independent live edit';
          }
          bytes.push(JSON.stringify([inDraftWrites(), notice.topic, notice.key, objectGraph([draw, notice.payload])]));
        }
        return original.addNotice(notice, settings);
      },
    });
    const recorded = run(false);
    expect(recorded.bytes.length).toBeGreaterThan(0);
    expect(run(true)).toStrictEqual(recorded);
  } finally {
    setStateProvider(original);
  }
});
