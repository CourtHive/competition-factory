import { getProvider, setOutcomePipeline, setStateProvider, setSubscriptions } from '@Global/state/globalState';
import { replaceWithBye } from '@Tests/mutations/drawDefinitions/testingUtilities';
import { compareHeldClaims } from '@Tests/testHarness/outcome/compareHeldClaims';
import { playCall, prepareCall } from '@Tests/testHarness/outcome/recordedCallHarness';
import { useEngineCatch } from '@Tests/testHarness/engineCatch';
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

// The suite's rethrowing provider is a custom wrapper. Exercise the production sync boundary here.
useEngineCatch();

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
  const provider = getProvider();
  const addNotice = provider.addNotice.bind(provider);
  const enqueued: string[] = [];
  vi.spyOn(provider, 'addNotice').mockImplementation((notice, ...rest) => {
    // Serialize here. Later writes can change the aliased draw or match in an earlier payload.
    enqueued.push(
      JSON.stringify(objectGraph(notice), (_, value) => (typeof value === 'function' ? '<function>' : value)),
    );
    return addNotice(notice, ...rest);
  });
  playCall('v1', call);
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

it('preserves the recording path for a provider that observes notice writes', () => {
  const call = prepareCall(reservedBye);
  const original = getProvider();
  const addNotice = vi.fn(original.addNotice.bind(original));
  try {
    setStateProvider({ ...original, addNotice });
    compareHeldClaims(call, false);
    expect(addNotice).toHaveBeenCalled();
  } finally {
    setStateProvider(original);
  }
});
