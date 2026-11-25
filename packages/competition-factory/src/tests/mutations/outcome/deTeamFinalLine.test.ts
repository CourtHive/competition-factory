import { prepareCall, playCall, expectPlayedParity } from '@Tests/testHarness/outcome/recordedCallHarness';
import { getOutcomePipeline, setOutcomePipeline, setSubscriptions } from '@Global/state/globalState';
import { findTarget, POLICY_OFF, won } from '@Tests/testHarness/outcome/directionFixtures';
import * as nested from '@Mutate/matchUps/outcome/plan/recordedCascade';
import * as legacy from '@Mutate/matchUps/matchUpStatus/setMatchUpState';
import * as whole from '@Mutate/matchUps/outcome/plan/recordedCall';
import * as family from '@Mutate/matchUps/outcome/plan/teamFinalLine';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getSideDrawPosition } from '@Query/matchUps/getDrawPositionSides';
import { setClock } from '@Tools/clock';
import mocks from '@Assemblies/engines/mock';
import engine from '@Engines/syncEngine';

import { CONSOLATION, DOUBLE_ELIMINATION, LOSER, MAIN } from '@Constants/drawDefinitionConstants';
import { TEAM } from '@Constants/matchUpTypes';

const drawId = 'd';
const target = { structureName: 'Main', roundNumber: 3, roundPosition: 1 };
let previous: ReturnType<typeof getOutcomePipeline>;
beforeEach(() => {
  previous = getOutcomePipeline();
});
afterEach(() => {
  vi.restoreAllMocks();
  setSubscriptions({ subscriptions: {} });
  setOutcomePipeline(previous);
  setClock();
});

function prepare(side: 1 | 2, policyOff = false, held = false) {
  return prepareCall(() => {
    mocks.generateTournamentRecord({
      drawProfiles: [
        {
          drawId,
          drawType: DOUBLE_ELIMINATION,
          drawSize: 8,
          participantsCount: 2,
          eventType: TEAM,
          tieFormatName: 'USTA_COLLEGE',
        },
      ],
      nonRandom: 1,
      setState: true,
    });
    if (policyOff) expect(engine.attachPolicies({ policyDefinitions: POLICY_OFF }).success).toBe(true);
    expect(engine.generateLineUps({ drawId, useDefaultEventRanking: true, attach: true }).success).toBe(true);
    const win = { winningSide: side };
    if (held) {
      expect(engine.setMatchUpStatus({ drawId, matchUpId: findTarget(target), outcome: win }).success).toBe(true);
    } else {
      for (const singlesLine of [0, 1, 2]) {
        const matchUpId = findTarget({ ...target, singlesLine });
        expect(engine.setMatchUpStatus({ drawId, matchUpId, outcome: win }).success).toBe(true);
      }
    }
    return { drawId, matchUpId: findTarget({ ...target, singlesLine: held ? 0 : 3 }), outcome: held ? won(side) : win };
  });
}

it.each([
  [1, false, false],
  [2, false, false],
  [1, true, false],
  [2, true, false],
  [2, false, true],
] as const)(
  'owns the fresh line through the engine (side %i, policy off %s, dual already decided %s)',
  (side, off, held) => {
    const call = prepare(side, off, held);
    const program = vi.spyOn(family, 'teamFinalLine');
    program.mockReturnValueOnce(undefined);
    const reference = playCall('v2', call);
    expect(reference.result.success).toBe(true);
    expect(program).toHaveBeenCalledTimes(1);
    const wholeWriter = vi.spyOn(whole, 'recordWholeCall').mockReturnValue(undefined);
    const nestedWriter = vi.spyOn(nested, 'recordDoubleExitCascade').mockReturnValue(undefined);
    const oldWriter = vi.spyOn(legacy, 'setMatchUpState');
    program.mockClear();
    const native = playCall('v2', call);
    expect(program.mock.results.map(({ value }) => !!value?.ops)).toEqual([true]);
    expect(wholeWriter).not.toHaveBeenCalled();
    expect(nestedWriter).not.toHaveBeenCalled();
    expect(oldWriter).not.toHaveBeenCalled();
    expectPlayedParity(native, reference);
    expectPlayedParity(playCall('differential', call), reference);
  },
);

it.each(['wrong feed', 'finishing order gap', 'occupied receiver', 'stale scored time'] as const)(
  'leaves %s to the existing writer',
  (condition) => {
    const call = prepare(1);
    const draw = call.prepared.events![0].drawDefinitions![0];
    const main = draw.structures!.find((s) => s.stage === MAIN)!;
    const back = draw.structures!.find((s) => s.stage === CONSOLATION)!;
    const dual = main.matchUps!.find((m) => m.tieMatchUps?.some((line) => line.matchUpId === call.params.matchUpId))!;
    const feeder = back.matchUps!.find((m) => m.matchUpId === dual.loserMatchUpId)!;
    if (condition === 'wrong feed') {
      const final = main.matchUps!.find((m) => m.matchUpId === dual.winnerMatchUpId)!;
      const link = draw.links!.find(
        (l) =>
          l.linkType === LOSER &&
          l.source.structureId === main.structureId &&
          l.source.roundNumber === final.roundNumber,
      )!;
      link.source.roundNumber = dual.roundNumber;
    } else if (condition === 'occupied receiver') {
      const held = back.positionAssignments!.find((a) => feeder.drawPositions!.includes(a.drawPosition) && !a.bye)!;
      held.participantId = main.positionAssignments!.find(
        (a) => a.drawPosition === getSideDrawPosition({ matchUp: dual, sideNumber: 2 }),
      )!.participantId;
    } else if (condition === 'finishing order gap') {
      dual.tieMatchUps!.find((m) => m.orderOfFinish === 1)!.orderOfFinish = 99;
    } else {
      feeder.tieMatchUps![0].schedule = { scoredTime: '2026-10-24T11:00:00.000Z' };
    }
    const native = vi.spyOn(family, 'teamFinalLine');
    native.mockImplementationOnce(() => undefined);
    const baseline = playCall('v2', call);
    native.mockClear();
    const actual = playCall('v2', call);
    expect(native.mock.results.some(({ value }) => value?.ops)).toBe(false);
    expectPlayedParity(actual, baseline);
  },
);
