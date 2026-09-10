import { expect, test, describe } from 'vitest';

import { getLapses } from '@Query/ladder/getLapses';

import { CHALLENGE_ACCEPTED, CHALLENGE_DECLINED } from '@Constants/ladderConstants';
import { CONSECUTIVE, DECLINE, DROP, EXPIRY, FORFEIT_POSITION, ROLLING, UNPLAYED } from '@Constants/ladderConstants';
import { CHALLENGED, COMPLETED, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { POLICY_TYPE_LADDER } from '@Constants/policyConstants';
import { LADDER } from '@Constants/drawDefinitionConstants';

const ASOF = '2026-04-01T00:00:00.000Z';

// The DEFENDER is side 2 — being challenged and failing to meet it is the offence.
const challenge = ({ id, issuedAt, status = CHALLENGED, declinedAt, acceptedAt }: any) => ({
  matchUpId: id,
  matchUpStatus: status,
  sides: [
    { sideNumber: 1, participantId: 'challenger' },
    { sideNumber: 2, participantId: 'target' },
  ],
  timeItems: [
    { itemType: 'ladder.challenge.issued', itemValue: 'challenger', itemDate: issuedAt },
    ...(declinedAt ? [{ itemType: CHALLENGE_DECLINED, itemValue: true, itemDate: declinedAt }] : []),
    ...(acceptedAt ? [{ itemType: CHALLENGE_ACCEPTED, itemValue: true, itemDate: acceptedAt }] : []),
  ],
});

const setup = (lapsePolicy: any, matchUps: any[], extra: any = {}) => {
  const structure: any = { structureId: 's1', matchUps, positionAssignments: [] };
  const drawDefinition: any = {
    drawId: 'd1',
    drawType: LADDER,
    structures: [structure],
    extensions: [
      {
        name: 'appliedPolicies',
        value: { [POLICY_TYPE_LADDER]: { acceptanceDays: 5, playByDays: 14, lapsePolicy, ...extra } },
      },
    ],
  };
  return { structure, drawDefinition };
};

describe('the three lapse kinds', () => {
  test('a decline counts', () => {
    const { structure, drawDefinition } = setup({ allowance: 0, consequence: FORFEIT_POSITION }, [
      challenge({ id: 'a', issuedAt: '2026-03-01T00:00:00.000Z', declinedAt: '2026-03-02T00:00:00.000Z' }),
    ]);
    const result = getLapses({ participantId: 'target', asOf: ASOF, structure, drawDefinition });
    expect(result.lapses.map((l) => l.kind)).toEqual([DECLINE]);
    expect(result.exceeded).toEqual(true);
  });

  test('an IGNORED challenge counts — without this the policy is avoidable', () => {
    // The whole loophole: a defender who simply never answers must not accumulate nothing.
    const { structure, drawDefinition } = setup({ allowance: 0, consequence: FORFEIT_POSITION }, [
      challenge({ id: 'a', issuedAt: '2026-03-01T00:00:00.000Z' }), // never answered, acceptanceDays 5
    ]);
    const result = getLapses({ participantId: 'target', asOf: ASOF, structure, drawDefinition });
    expect(result.lapses.map((l) => l.kind)).toEqual([EXPIRY]);
  });

  test('accepted and never played counts', () => {
    const { structure, drawDefinition } = setup({ allowance: 0, consequence: FORFEIT_POSITION }, [
      challenge({
        id: 'a',
        issuedAt: '2026-03-01T00:00:00.000Z',
        acceptedAt: '2026-03-02T00:00:00.000Z',
        status: TO_BE_PLAYED,
      }),
    ]);
    const result = getLapses({ participantId: 'target', asOf: ASOF, structure, drawDefinition });
    expect(result.lapses.map((l) => l.kind)).toEqual([UNPLAYED]);
  });

  test('a played match is no lapse at all', () => {
    const { structure, drawDefinition } = setup({ allowance: 0, consequence: FORFEIT_POSITION }, [
      challenge({
        id: 'a',
        issuedAt: '2026-03-01T00:00:00.000Z',
        acceptedAt: '2026-03-02T00:00:00.000Z',
        status: COMPLETED,
      }),
    ]);
    expect(getLapses({ participantId: 'target', asOf: ASOF, structure, drawDefinition }).count).toEqual(0);
  });

  test('countsAsLapse can exclude a kind — and excluding EXPIRY is how you break it', () => {
    const { structure, drawDefinition } = setup(
      { allowance: 0, consequence: FORFEIT_POSITION, countsAsLapse: [DECLINE] },
      [challenge({ id: 'a', issuedAt: '2026-03-01T00:00:00.000Z' })],
    );
    expect(getLapses({ participantId: 'target', asOf: ASOF, structure, drawDefinition }).count).toEqual(0);
  });

  test('only the DEFENDER lapses — issuing challenges is not an offence', () => {
    const { structure, drawDefinition } = setup({ allowance: 0, consequence: FORFEIT_POSITION }, [
      challenge({ id: 'a', issuedAt: '2026-03-01T00:00:00.000Z' }),
    ]);
    expect(getLapses({ participantId: 'challenger', asOf: ASOF, structure, drawDefinition }).count).toEqual(0);
  });
});

describe('allowance and windows', () => {
  const three = [
    challenge({ id: 'a', issuedAt: '2026-01-01T00:00:00.000Z', declinedAt: '2026-01-02T00:00:00.000Z' }),
    challenge({ id: 'b', issuedAt: '2026-02-01T00:00:00.000Z', declinedAt: '2026-02-02T00:00:00.000Z' }),
    challenge({ id: 'c', issuedAt: '2026-03-25T00:00:00.000Z', declinedAt: '2026-03-26T00:00:00.000Z' }),
  ];

  test('an allowance is free declines, not a threshold of zero', () => {
    const { structure, drawDefinition } = setup({ allowance: 2, consequence: FORFEIT_POSITION }, three);
    const result = getLapses({ participantId: 'target', asOf: ASOF, structure, drawDefinition });
    expect(result.count).toEqual(3);
    expect(result.exceeded).toEqual(true); // 3 > 2

    const generous = setup({ allowance: 3, consequence: FORFEIT_POSITION }, three);
    expect(getLapses({ participantId: 'target', asOf: ASOF, ...generous }).exceeded).toEqual(false);
  });

  test('a ROLLING window forgets the old ones', () => {
    const { structure, drawDefinition } = setup(
      { allowance: 0, window: ROLLING, windowDays: 30, consequence: DROP, dropPositions: 2 },
      three,
    );
    const result = getLapses({ participantId: 'target', asOf: ASOF, structure, drawDefinition });
    // Only the 2026-03-26 decline is inside 30 days of 2026-04-01.
    expect(result.count).toEqual(1);
    expect(result.consequence).toEqual(DROP);
    expect(result.dropPositions).toEqual(2);
  });

  test('CONSECUTIVE is forgiven by turning up', () => {
    const played = challenge({
      id: 'p',
      issuedAt: '2026-02-15T00:00:00.000Z',
      acceptedAt: '2026-02-16T00:00:00.000Z',
      status: COMPLETED,
    });
    const { structure, drawDefinition } = setup({ allowance: 0, window: CONSECUTIVE, consequence: FORFEIT_POSITION }, [
      ...three,
      played,
    ]);
    // Two declines precede the played match; only the March one survives the break.
    expect(getLapses({ participantId: 'target', asOf: ASOF, structure, drawDefinition }).count).toEqual(1);
  });

  test('no consequence means nothing is ever exceeded, however many lapses', () => {
    // A club can count without punishing.
    const { structure, drawDefinition } = setup({ allowance: 0 }, three);
    const result = getLapses({ participantId: 'target', asOf: ASOF, structure, drawDefinition });
    expect(result.count).toEqual(3);
    expect(result.exceeded).toEqual(false);
  });
});

describe('declineForfeitsPosition is sugar', () => {
  test('the boolean behaves as allowance 0 with FORFEIT_POSITION', () => {
    const structure: any = {
      structureId: 's1',
      positionAssignments: [],
      matchUps: [challenge({ id: 'a', issuedAt: '2026-03-01T00:00:00.000Z', declinedAt: '2026-03-02T00:00:00.000Z' })],
    };
    const drawDefinition: any = {
      drawId: 'd1',
      drawType: LADDER,
      structures: [structure],
      extensions: [
        {
          name: 'appliedPolicies',
          value: { [POLICY_TYPE_LADDER]: { acceptanceDays: 5, declineForfeitsPosition: true } },
        },
      ],
    };
    const result = getLapses({ participantId: 'target', asOf: ASOF, structure, drawDefinition });
    expect(result.exceeded).toEqual(true);
    expect(result.consequence).toEqual(FORFEIT_POSITION);
  });
});
