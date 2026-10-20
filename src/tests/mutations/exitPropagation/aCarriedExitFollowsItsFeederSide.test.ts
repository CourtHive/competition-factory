import { reconcileProvenanceSides } from '@Mutate/matchUps/matchUpStatus/reconcileProvenanceSides';
import { prepareDraw, replay } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import { beforeEach, expect, it } from 'vitest';
import {
  clearOutcome,
  getDrawDefinition,
  getDrawMatchUps,
  observeMutation,
} from '@Tests/testHarness/exitPropagation/transitions';

// constants and types
import { completedMatchUpStatuses, DOUBLE_WALKOVER, WALKOVER, DEFAULTED } from '@Constants/matchUpStatusConstants';
import { MODIFIED_FEED_IN_CHAMPIONSHIP } from '@Constants/drawDefinitionConstants';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';

type Step = { structureName: string; roundNumber: number; roundPosition: number; outcome: any };
const CONFIG = {
  participantsCount: 32,
  propagateExitStatus: true,
  drawSize: 32,
  drawType: MODIFIED_FEED_IN_CHAMPIONSHIP,
  seed: 30030527,
};
const POLICY_OFF = { [POLICY_TYPE_PROGRESSION]: { doubleExitPropagateBye: false } };
const coordinate = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;
const TARGET = 'Consolation|3|4';

/**
 * A CARRIED EXIT FOLLOWS ITS FEEDER'S CURRENT SIDE (Phase B policy-off 30030527, shrunk 30 -> 6).
 * Rule 3 remains unchanged: with both drawPositions 8 and 21, the feeder carrying 21 is side 2;
 * after 21 leaves, the remaining feeder puts 8 on side 2 and the carried exit belongs on side 1.
 * The entry must not retain the side it occupied when written. CA ruling (1), 2026-10-20; Mentat P59.
 * Reconciliation is restricted to unscored targets with one carried entry and two winner feeders.
 */
const SCHEDULE: Step[] = [
  {
    structureName: 'Main',
    roundNumber: 1,
    roundPosition: 3,
    outcome: {
      matchUpStatus: 'DOUBLE_WALKOVER',
    },
  },
  {
    structureName: 'Main',
    roundNumber: 1,
    roundPosition: 16,
    outcome: {
      matchUpStatus: 'DEFAULTED',
      winningSide: 1,
    },
  },
  {
    structureName: 'Main',
    roundNumber: 1,
    roundPosition: 1,
    outcome: {
      winningSide: 1,
    },
  },
  {
    structureName: 'Main',
    roundNumber: 1,
    roundPosition: 14,
    outcome: {
      matchUpStatus: 'DOUBLE_DEFAULT',
    },
  },
  {
    structureName: 'Main',
    roundNumber: 1,
    roundPosition: 15,
    outcome: {
      matchUpStatus: 'WALKOVER',
      winningSide: 1,
    },
  },
  {
    structureName: 'Main',
    roundNumber: 1,
    roundPosition: 13,
    outcome: {
      matchUpStatus: 'DOUBLE_WALKOVER',
    },
  },
];
const NET_FORWARD: Step[] = [
  {
    structureName: 'Main',
    roundNumber: 1,
    roundPosition: 1,
    outcome: {
      winningSide: 1,
    },
  },
  {
    structureName: 'Main',
    roundNumber: 1,
    roundPosition: 3,
    outcome: {
      matchUpStatus: 'DOUBLE_WALKOVER',
    },
  },
  {
    structureName: 'Main',
    roundNumber: 1,
    roundPosition: 13,
    outcome: {
      matchUpStatus: 'DOUBLE_WALKOVER',
    },
  },
  {
    structureName: 'Main',
    roundNumber: 1,
    roundPosition: 14,
    outcome: {
      matchUpStatus: 'DOUBLE_DEFAULT',
    },
  },
  {
    structureName: 'Main',
    roundNumber: 1,
    roundPosition: 15,
    outcome: {
      matchUpStatus: 'WALKOVER',
      winningSide: 1,
    },
  },
  {
    structureName: 'Main',
    roundNumber: 1,
    roundPosition: 16,
    outcome: {
      matchUpStatus: 'DEFAULTED',
      winningSide: 1,
    },
  },
];
const FULL_SCHEDULE: Step[] = [
  {
    structureName: 'Main',
    roundNumber: 1,
    roundPosition: 8,
    outcome: {
      winningSide: 1,
    },
  },
  {
    structureName: 'Main',
    roundNumber: 1,
    roundPosition: 4,
    outcome: {
      matchUpStatus: 'WALKOVER',
      winningSide: 2,
    },
  },
  {
    structureName: 'Main',
    roundNumber: 1,
    roundPosition: 14,
    outcome: {
      matchUpStatus: 'DOUBLE_WALKOVER',
    },
  },
  {
    structureName: 'Main',
    roundNumber: 1,
    roundPosition: 9,
    outcome: {
      winningSide: 2,
    },
  },
  {
    structureName: 'Main',
    roundNumber: 1,
    roundPosition: 9,
    outcome: {
      matchUpStatus: 'DOUBLE_DEFAULT',
    },
  },
  {
    structureName: 'Main',
    roundNumber: 1,
    roundPosition: 10,
    outcome: {
      winningSide: 1,
    },
  },
  {
    structureName: 'Main',
    roundNumber: 1,
    roundPosition: 3,
    outcome: {
      matchUpStatus: 'DOUBLE_WALKOVER',
    },
  },
  {
    structureName: 'Main',
    roundNumber: 1,
    roundPosition: 9,
    outcome: {
      winningSide: 1,
    },
  },
  {
    structureName: 'Main',
    roundNumber: 1,
    roundPosition: 2,
    outcome: {
      matchUpStatus: 'DEFAULTED',
      winningSide: 1,
    },
  },
  {
    structureName: 'Main',
    roundNumber: 1,
    roundPosition: 16,
    outcome: {
      matchUpStatus: 'DEFAULTED',
      winningSide: 1,
    },
  },
  {
    structureName: 'Main',
    roundNumber: 1,
    roundPosition: 2,
    outcome: {
      winningSide: 2,
    },
  },
  {
    structureName: 'Main',
    roundNumber: 1,
    roundPosition: 11,
    outcome: {
      matchUpStatus: 'DOUBLE_WALKOVER',
    },
  },
  {
    structureName: 'Main',
    roundNumber: 1,
    roundPosition: 8,
    outcome: {
      winningSide: 1,
    },
  },
  {
    structureName: 'Main',
    roundNumber: 1,
    roundPosition: 9,
    outcome: {
      matchUpStatus: 'DOUBLE_WALKOVER',
    },
  },
  {
    structureName: 'Main',
    roundNumber: 1,
    roundPosition: 14,
    outcome: {
      winningSide: 1,
    },
  },
  {
    structureName: 'Main',
    roundNumber: 1,
    roundPosition: 9,
    outcome: {
      winningSide: 2,
    },
  },
  {
    structureName: 'Consolation',
    roundNumber: 1,
    roundPosition: 5,
    outcome: {
      winningSide: 1,
    },
  },
  {
    structureName: 'Main',
    roundNumber: 1,
    roundPosition: 5,
    outcome: {
      winningSide: 1,
    },
  },
  {
    structureName: 'Main',
    roundNumber: 1,
    roundPosition: 5,
    outcome: {
      winningSide: 2,
    },
  },
  {
    structureName: 'Main',
    roundNumber: 1,
    roundPosition: 15,
    outcome: {
      winningSide: 1,
    },
  },
  {
    structureName: 'Main',
    roundNumber: 1,
    roundPosition: 1,
    outcome: {
      winningSide: 1,
    },
  },
  {
    structureName: 'Main',
    roundNumber: 1,
    roundPosition: 14,
    outcome: {
      matchUpStatus: 'DOUBLE_DEFAULT',
    },
  },
  {
    structureName: 'Main',
    roundNumber: 1,
    roundPosition: 15,
    outcome: {
      winningSide: 2,
    },
  },
  {
    structureName: 'Consolation',
    roundNumber: 1,
    roundPosition: 5,
    outcome: {
      winningSide: 2,
    },
  },
  {
    structureName: 'Main',
    roundNumber: 1,
    roundPosition: 2,
    outcome: {
      score: {
        scoreStringSide1: '',
        scoreStringSide2: '',
      },
      matchUpStatus: 'TO_BE_PLAYED',
    },
  },
  {
    structureName: 'Main',
    roundNumber: 1,
    roundPosition: 15,
    outcome: {
      matchUpStatus: 'WALKOVER',
      winningSide: 1,
    },
  },
  {
    structureName: 'Main',
    roundNumber: 2,
    roundPosition: 8,
    outcome: {
      matchUpStatus: 'RETIRED',
      winningSide: 1,
      score: {
        sets: [
          {
            side1Score: 6,
            side2Score: 3,
          },
        ],
      },
    },
  },
  {
    structureName: 'Main',
    roundNumber: 1,
    roundPosition: 13,
    outcome: {
      matchUpStatus: 'DOUBLE_WALKOVER',
    },
  },
  {
    structureName: 'Main',
    roundNumber: 1,
    roundPosition: 6,
    outcome: {
      winningSide: 1,
    },
  },
  {
    structureName: 'Main',
    roundNumber: 1,
    roundPosition: 11,
    outcome: {
      winningSide: 1,
    },
  },
];

function build(steps: Step[], drawId: string) {
  expect(prepareDraw(CONFIG, drawId, POLICY_OFF)).toBe(true);
  for (const step of steps) {
    const target = getDrawMatchUps(drawId).find((matchUp) => coordinate(matchUp) === coordinate(step));
    expect(target).toBeDefined();
    const observed = observeMutation({
      drawId,
      matchUpId: target.matchUpId,
      propagateExitStatus: true,
      outcome: step.outcome,
    });
    expect(observed.error).toBeUndefined();
    expect(observed.thrown).toBeUndefined();
  }
  return getDrawDefinition(drawId);
}

function carriedEntry(drawId: string) {
  const matchUps = getDrawMatchUps(drawId);
  const target = matchUps.find((matchUp) => coordinate(matchUp) === TARGET);
  return Object.fromEntries(
    Object.entries(target.sideExitProvenance ?? {}).map(([side, entry]: [string, any]) => [
      side,
      {
        ...entry,
        sourceMatchUpId: coordinate(matchUps.find((matchUp) => matchUp.matchUpId === entry.sourceMatchUpId)),
      },
    ]),
  );
}

beforeEach(() => setSubscriptions({}));

it('records the carried exit on its feeder side before a probe, as forward entry does', () => {
  build(SCHEDULE, 'side-key-scheduled');
  const actual = carriedEntry('side-key-scheduled');
  expect(Object.keys(actual)).toEqual(['1']);
  expect(actual['1'].sourceMatchUpId).toBe('Consolation|1|7');
  build(NET_FORWARD, 'side-key-forward');
  expect(carriedEntry('side-key-forward')).toEqual(actual);
});

it('the shrunk schedule and every probe return the draw they found', () => {
  expect(replay(CONFIG, SCHEDULE, 'side-key-shrunk', POLICY_OFF)).toMatchObject({ verdict: 'clean', complete: true });
});

it('the full census history and every probe return the draw they found', () => {
  expect(replay(CONFIG, FULL_SCHEDULE, 'side-key-full', POLICY_OFF)).toMatchObject({
    verdict: 'clean',
    complete: true,
  });
});

it('the original double-walkover probe and clear leave the side-keyed entry unchanged', () => {
  build(SCHEDULE, 'side-key-probe');
  const before = carriedEntry('side-key-probe');
  const target = getDrawMatchUps('side-key-probe').find((matchUp) => coordinate(matchUp) === 'Main|1|2');
  for (const outcome of [{ matchUpStatus: DOUBLE_WALKOVER }, clearOutcome]) {
    expect(
      observeMutation({ drawId: 'side-key-probe', matchUpId: target.matchUpId, propagateExitStatus: true, outcome })
        .error,
    ).toBeUndefined();
  }
  expect(carriedEntry('side-key-probe')).toEqual(before);
});

it('reconciliation is idempotent on the settled draw', () => {
  const drawDefinition = build(SCHEDULE, 'side-key-idempotent');
  const before = structuredClone(drawDefinition);
  reconcileProvenanceSides({ drawDefinition });
  expect(drawDefinition).toEqual(before);
});

it.each([
  { winningSide: 1 },
  ...completedMatchUpStatuses
    .filter((status) => status !== WALKOVER && status !== DEFAULTED)
    .map((matchUpStatus) => ({ matchUpStatus })),
  { score: { sets: [{ setNumber: 1, side1Score: 1, side2Score: 0 }] } },
])('does not re-key a result-dependent entry: %j', (result) => {
  const drawDefinition = build(SCHEDULE, 'side-key-result');
  const targetId = getDrawMatchUps('side-key-result').find((matchUp) => coordinate(matchUp) === TARGET).matchUpId;
  const target = drawDefinition.structures
    .flatMap((structure: any) => structure.matchUps ?? [])
    .find((matchUp: any) => matchUp.matchUpId === targetId);
  const entry = target.sideExitProvenance[1];
  target.sideExitProvenance = { 2: entry };
  Object.assign(target, result);
  const before = structuredClone(drawDefinition);
  reconcileProvenanceSides({ drawDefinition });
  expect(drawDefinition).toEqual(before);
});
