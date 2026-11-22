import { heldClaimInput } from '@Tests/testHarness/outcome/heldByeClaimControls';
import { setOutcomePipeline, setSubscriptions } from '@Global/state/globalState';
import { planWinnerArrivals } from '@Mutate/matchUps/outcome/plan/directionOps';
import { objectGraph } from '@Tests/testHarness/outcome/objectGraph';
import { planWrite } from '@Mutate/matchUps/outcome/write';
import { oneReceiver, twoReceivers, compassArrival } from './protectedReceiverFixtures';
import { afterEach, expect, it, vi } from 'vitest';
import { setClock } from '@Tools/clock';

import type { RecordedCall } from '@Tests/testHarness/outcome/recordedCallHarness';
import type { HydratedMatchUp } from '@Types/hydrated';
import { WALKOVER, DEFAULTED } from '@Constants/matchUpStatusConstants';

afterEach(() => {
  setOutcomePipeline('v1');
  setSubscriptions({ subscriptions: {} });
  setClock();
});

function input(call: RecordedCall) {
  const args = heldClaimInput(call);
  const write = planWrite(args.request, args.view, args.route);
  const recorder = vi.fn(() => undefined);
  const plan = () => planWinnerArrivals({ ...args, write, recordWhole: recorder, record: () => undefined });
  const at = (name: string, round: number, position: number): HydratedMatchUp => {
    const structure = args.drawDefinition.structures!.find((s) => s.structureName === name)!;
    return args.view.inContextDrawMatchUps!.find(
      (m) => m.structureId === structure.structureId && m.roundNumber === round && m.roundPosition === position,
    )!;
  };
  return { args, plan, recorder, at };
}

type Input = ReturnType<typeof input>;
function check(call: RecordedCall, breakClaim: (ctx: Input) => void) {
  const current = input(call);
  const original = current.plan();
  expect(original?.length, 'admitted before perturbation').toBeGreaterThan(0);
  expect(current.recorder).not.toHaveBeenCalled();
  breakClaim(current);
  const before = JSON.stringify(objectGraph(current.args.drawDefinition));
  expect(current.plan(), 'rejected with whole-call and nested recorders disabled').toBeUndefined();
  expect(
    JSON.stringify(objectGraph(current.args.drawDefinition)) === before,
    'rejected planning preserves the draw',
  ).toBe(true);
  const recovery = input(call);
  expect(recovery.plan(), 'original input recovers the same ordered writes').toStrictEqual(original);
  expect(recovery.recorder).not.toHaveBeenCalled();
}

const oneFailures: [string, (ctx: Input) => void][] = [
  [
    'a collection-line projection',
    ({ args }) => {
      args.view.line = { dualMatchUpId: 'parent', autoCalcDisabled: true, dualRewrite: { scoreReported: false } };
    },
  ],
  [
    'independently active downstream play',
    ({ args }) => {
      args.view.activeDownstream = true;
    },
  ],
  [
    'a carrier different from the losing participant at the named feeder',
    ({ at }) => {
      const on = at('Consolation', 2, 2);
      const carrier = on.sides!.find((s) => s.sideNumber === 1)!;
      expect(carrier.participantId).toBeDefined();
      carrier.participantId = 'another-carrier';
    },
  ],
  [
    'a stored winner edge to a different receiver',
    ({ at }) => {
      at('Main', 1, 3).winnerMatchUpId = at('Consolation', 2, 2).matchUpId;
    },
  ],
  [
    'a named feeder whose stored loser edge points elsewhere',
    ({ at }) => {
      at('Main', 2, 1).loserMatchUpId = at('Consolation', 3, 1).matchUpId;
    },
  ],
  [
    'a default mark claiming an incompatible prior walkover',
    ({ at }) => {
      at('Consolation', 2, 2).sideExitProvenance![1].previousMatchUpStatus = WALKOVER;
    },
  ],
  [
    'a qualifier on the free linked assignment',
    ({ args }) => {
      const structure = args.drawDefinition.structures!.find((s) => s.structureName === 'Consolation')!;
      structure.positionAssignments!.find((a) => a.drawPosition === 6)!.qualifier = true;
    },
  ],
  [
    'an additional mark on the arriving side',
    ({ at }) => {
      const receiver = at('Consolation', 2, 2);
      receiver.sideExitProvenance = {
        ...receiver.sideExitProvenance,
        2: { sourceMatchUpId: 'competing-origin', previousMatchUpStatus: WALKOVER, matchUpStatus: WALKOVER },
      };
    },
  ],
  [
    'a played score on the onward landing',
    ({ at }) => {
      at('Consolation', 3, 1).score = { sets: [{ side1Score: 1, side2Score: 0 }] };
    },
  ],
];

it.each(oneFailures)('the one-receiver claim yields to %s', (_why, change) => check(oneReceiver(), change));

it('requires the second produced award to have an empty exiting seat', () =>
  check(twoReceivers(), ({ at }) => {
    const second = at('Main', 3, 1);
    expect(second.sideExitProvenance?.[1]?.matchUpStatus).toBe(WALKOVER);
    const seat = second.sides!.find((s) => s.sideNumber === 1);
    if (seat) seat.participantId = 'already-present';
    else second.sides!.push({ sideNumber: 1, participantId: 'already-present' });
  }));

it('requires the carried mark on the intervening BYE to agree with the receiver', () =>
  check(compassArrival(false), ({ at }) => {
    const bye = at('West', 1, 1);
    const mark = Object.values(bye.sideExitProvenance!)[0];
    expect(mark.matchUpStatus).toBe(WALKOVER);
    mark.matchUpStatus = DEFAULTED;
  }));
