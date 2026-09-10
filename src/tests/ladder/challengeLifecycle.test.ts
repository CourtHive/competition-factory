import { expect, test, describe } from 'vitest';

import { acceptChallenge, declineChallenge } from '@Mutate/ladder/respondToChallenge';
import { getChallengeState } from '@Query/ladder/getChallengeState';
import { issueChallenge } from '@Mutate/ladder/issueChallenge';

import { ACCEPTED, DECLINED, EXPIRED, PENDING } from '@Constants/ladderConstants';
import { CHALLENGED, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { LADDER, SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';

const ISSUED = '2026-03-01T10:00:00.000Z';
const policy = { acceptanceDays: 5, challengeRange: 3 };

// A ladder standing, hand-built: the machinery under test operates on positionAssignments and
// matchUps, so a full generated tournament would obscure rather than exercise it.
const ladder = () => {
  const structure: any = {
    structureId: 's1',
    matchUps: [],
    positionAssignments: [
      { drawPosition: 1, participantId: 'p1' },
      { drawPosition: 4, participantId: 'p4' },
      { drawPosition: 5, participantId: 'p5' },
      { drawPosition: 9, participantId: 'p9' },
    ],
  };
  return { drawId: 'd1', drawType: LADDER, structures: [structure] };
};

const issue = (drawDefinition: any, challenger: string, defender: string) =>
  issueChallenge({
    challengerParticipantId: challenger,
    defenderParticipantId: defender,
    issuedAt: ISSUED,
    drawDefinition,
  }) as any;

describe('issuing a challenge', () => {
  test('creates an AD_HOC-shaped CHALLENGED matchUp with both participants on sides', () => {
    const drawDefinition = ladder();
    const result = issue(drawDefinition, 'p4', 'p1');
    expect(result.error).toBeUndefined();

    const matchUp = drawDefinition.structures[0].matchUps[0];
    expect(matchUp.matchUpStatus).toEqual(CHALLENGED);
    expect(matchUp.sides.map((s: any) => s.participantId)).toEqual(['p4', 'p1']);
    // Deliberately no positional geometry: a ladder position changes underneath the matchUp.
    expect(matchUp.drawPositions).toBeUndefined();
    expect(matchUp.roundPosition).toBeUndefined();
  });

  test('refuses a challenge outside the policy range, naming the range', () => {
    // p9 challenging p1 is eight positions — the default range is three.
    const result = issue(ladder(), 'p9', 'p1');
    expect(result.error).toBeDefined();
    expect(result.info).toMatch(/may not challenge/);
  });

  test('refuses a DOWNWARD challenge — that is not a ladder move', () => {
    const result = issue(ladder(), 'p1', 'p4');
    expect(result.error).toBeDefined();
  });

  test('refuses a participant not seated on the ladder', () => {
    // Someone who has not joined has no position, so there is no range to judge.
    const result = issue(ladder(), 'ghost', 'p1');
    expect(result.error).toBeDefined();
  });

  test('refuses self-challenge, and refuses a non-LADDER drawType', () => {
    expect(issue(ladder(), 'p4', 'p4').error).toBeDefined();
    const notALadder = { ...ladder(), drawType: SINGLE_ELIMINATION };
    expect(issue(notALadder, 'p4', 'p1').error).toBeDefined();
  });
});

describe('expiry is DERIVED, never stored', () => {
  test('the same stored matchUp is PENDING or EXPIRED depending only on when you ask', () => {
    // This is the point of asOf: nothing runs at the moment of expiry to flip a flag.
    const drawDefinition = ladder();
    issue(drawDefinition, 'p4', 'p1');
    const matchUp = drawDefinition.structures[0].matchUps[0];

    const dayFour = getChallengeState({ matchUp, policy, asOf: '2026-03-05T10:00:00.000Z' });
    const daySix = getChallengeState({ matchUp, policy, asOf: '2026-03-07T10:00:00.000Z' });

    expect(dayFour.state).toEqual(PENDING);
    expect(daySix.state).toEqual(EXPIRED);
    expect(dayFour.expiresAt).toEqual('2026-03-06T10:00:00.000Z');
    expect(matchUp.matchUpStatus).toEqual(CHALLENGED); // unchanged by being read
  });
});

describe('responding', () => {
  test('accepting turns a challenge into a fixture to be played', () => {
    const drawDefinition = ladder();
    const { matchUpId } = issue(drawDefinition, 'p4', 'p1');
    const result = acceptChallenge({ drawDefinition, matchUpId, respondedAt: '2026-03-02T10:00:00.000Z' });

    expect(result.error).toBeUndefined();
    const matchUp = drawDefinition.structures[0].matchUps[0];
    expect(matchUp.matchUpStatus).toEqual(TO_BE_PLAYED);
    expect(getChallengeState({ matchUp, policy, asOf: '2026-03-02T10:00:00.000Z' }).state).toEqual(ACCEPTED);
  });

  test('accepting LATE is refused, judged against respondedAt', () => {
    // Accepting after expiry is a real thing a club will try, and the answer must not depend on
    // when a background job happened to run.
    const drawDefinition = ladder();
    const { matchUpId } = issue(drawDefinition, 'p4', 'p1');
    const result: any = acceptChallenge({ drawDefinition, matchUpId, respondedAt: '2026-03-20T10:00:00.000Z' });

    expect(result.error).toBeDefined();
    expect(result.info).toMatch(/expired/);
    expect(drawDefinition.structures[0].matchUps[0].matchUpStatus).toEqual(CHALLENGED);
  });

  test('declining records the decline and evaluates the lapse', () => {
    // Under the shipped default there is no consequence at all, so nothing is applied — a club may
    // count without punishing.
    const drawDefinition = ladder();
    const { matchUpId } = issue(drawDefinition, 'p4', 'p1');
    const result: any = declineChallenge({ drawDefinition, matchUpId, respondedAt: '2026-03-02T10:00:00.000Z' });

    expect(result.error).toBeUndefined();
    expect(result.applied).toEqual(false);
    const matchUp = drawDefinition.structures[0].matchUps[0];
    expect(getChallengeState({ matchUp, policy, asOf: '2026-03-02T10:00:00.000Z' }).state).toEqual(DECLINED);
  });

  test('a challenge cannot be answered twice', () => {
    const drawDefinition = ladder();
    const { matchUpId } = issue(drawDefinition, 'p4', 'p1');
    acceptChallenge({ drawDefinition, matchUpId, respondedAt: '2026-03-02T10:00:00.000Z' });
    const again: any = acceptChallenge({ drawDefinition, matchUpId, respondedAt: '2026-03-03T10:00:00.000Z' });
    expect(again.error).toBeDefined();
  });
});
