import { acceptChallenge, declineChallenge } from '@Mutate/ladder/respondToChallenge';
import { removeLadderParticipant } from '@Mutate/ladder/removeLadderParticipant';
import { confirmResult, submitResult } from '@Mutate/ladder/reportResult';
import { applyLadderMovement } from '@Mutate/ladder/applyLadderMovement';
import { issueChallenge } from '@Mutate/ladder/issueChallenge';
import { describe, expect, test } from 'vitest';

// constants
import { DROP, MOVEMENT_APPLIED, RANK, RESULT, SWAP } from '@Constants/ladderConstants';
import { PARTICIPANT_NOT_FOUND } from '@Constants/errorConditionConstants';
import { POLICY_TYPE_LADDER } from '@Constants/policyConstants';
import { LADDER } from '@Constants/drawDefinitionConstants';
import { RANKING } from '@Constants/scaleConstants';

/**
 * LADDER-101: a standing move whose history cannot be written must fail and leave the standing as
 * it was. mirrorStandingToScale returned an error every caller ignored, so a challenger missing from
 * the record moved up with `{ success, moved: true }` and no history at all.
 */
const AT = (day: number) => `2026-03-${String(day).padStart(2, '0')}T10:00:00.000Z`;
const person = (participantId: string) => ({
  participantId,
  participantType: 'INDIVIDUAL',
  participantRole: 'COMPETITOR',
});

function ladder(ids: string[], lapsePolicy?: any) {
  const structure: any = {
    structureId: 's1',
    matchUps: [],
    positionAssignments: ids.map((participantId, index) => ({ drawPosition: index + 1, participantId })),
  };
  const drawDefinition: any = {
    drawId: 'd1',
    drawType: LADDER,
    structures: [structure],
    extensions: [
      {
        name: 'appliedPolicies',
        value: { [POLICY_TYPE_LADDER]: { ordering: RANK, movement: SWAP, acceptanceDays: 5, lapsePolicy } },
      },
    ],
  };
  return { drawDefinition, structure };
}

const standing = (structure: any) =>
  [...structure.positionAssignments]
    .sort((a: any, b: any) => a.drawPosition - b.drawPosition)
    .map((a: any) => a.participantId);
const rankings = (tournamentRecord: any, participantId: string) =>
  (tournamentRecord.participants.find((p: any) => p.participantId === participantId)?.timeItems ?? []).filter(
    (timeItem: any) => timeItem.itemType?.includes(RANKING),
  );

/** challenger (rank 2) beats defender (rank 1), attested by the defender */
function attestedChallenge(participants: string[]) {
  const { drawDefinition, structure } = ladder(['defender', 'challenger']);
  const tournamentRecord: any = { tournamentId: 't1', participants: participants.map(person) };
  const { matchUpId }: any = issueChallenge({
    challengerParticipantId: 'challenger',
    defenderParticipantId: 'defender',
    issuedAt: AT(1),
    drawDefinition,
  });
  acceptChallenge({ drawDefinition, matchUpId, respondedAt: AT(1) });
  const submitted: any = submitResult({
    outcome: { winningSide: 1 },
    participantId: 'challenger',
    submittedAt: AT(2),
    drawDefinition,
    matchUpId,
  });
  const confirmed: any = confirmResult({ participantId: 'defender', confirmedAt: AT(3), drawDefinition, matchUpId });
  expect([submitted.error, confirmed.error]).toEqual([undefined, undefined]);
  const move = (day: number) =>
    applyLadderMovement({ trigger: RESULT, appliedAt: AT(day), tournamentRecord, drawDefinition, matchUpId } as any);
  return { drawDefinition, structure, tournamentRecord, matchUpId, move };
}

describe('mirror failure fails the move (LADDER-101)', () => {
  test('a challenge result whose challenger is missing from the record does not move the standing', () => {
    const { structure, tournamentRecord, move } = attestedChallenge(['defender']);
    let result: any = move(4);
    expect(result.error).toEqual(PARTICIPANT_NOT_FOUND);
    expect(result.moved).toBeUndefined();
    expect(result.context.participantId).toEqual('challenger');
    expect(standing(structure)).toEqual(['defender', 'challenger']);
    expect(rankings(tournamentRecord, 'defender')).toEqual([]);
    // nothing was marked applied, so once the record is whole the same result moves the standing
    expect(structure.matchUps[0].timeItems.some((t: any) => t.itemType === MOVEMENT_APPLIED)).toEqual(false);

    tournamentRecord.participants.push(person('challenger'));
    result = move(5);
    expect(result.success).toEqual(true);
    expect(result.moved).toEqual(true);
    expect(standing(structure)).toEqual(['challenger', 'defender']);
    expect(rankings(tournamentRecord, 'defender')).toHaveLength(1);
  });

  test('an operator removal that cannot record history leaves the ladder and its log unchanged', () => {
    const { drawDefinition, structure } = ladder(['a', 'b', 'c']);
    const tournamentRecord: any = { tournamentId: 't1', participants: [person('a'), person('b')] };
    let result: any = removeLadderParticipant({
      participantId: 'b',
      removedAt: AT(2),
      drawDefinition,
      tournamentRecord,
    });
    expect(result.error).toEqual(PARTICIPANT_NOT_FOUND);
    expect(standing(structure)).toEqual(['a', 'b', 'c']);
    expect(structure.timeItems ?? []).toEqual([]);
  });

  test('a DROP lapse consequence that cannot record history is refused, not reported applied', () => {
    const { drawDefinition, structure } = ladder(['p1', 'p2', 'p3'], {
      allowance: 0,
      consequence: DROP,
      dropPositions: 1,
    });
    const tournamentRecord: any = { tournamentId: 't1', participants: [person('p1'), person('p3')] };
    const { matchUpId }: any = issueChallenge({
      challengerParticipantId: 'p3',
      defenderParticipantId: 'p1',
      issuedAt: AT(1),
      drawDefinition,
    });
    let result: any = declineChallenge({ drawDefinition, tournamentRecord, matchUpId, respondedAt: AT(2) } as any);
    expect(result.error).toEqual(PARTICIPANT_NOT_FOUND);
    expect(standing(structure)).toEqual(['p1', 'p2', 'p3']);
  });
});

describe('re-applying a result (LADDER-101)', () => {
  test('a second application for the same matchUp is answered as already applied', () => {
    const { structure, tournamentRecord, move } = attestedChallenge(['defender', 'challenger']);
    let result: any = move(4);
    expect(result.moved).toEqual(true);
    const history = rankings(tournamentRecord, 'defender').length;

    result = move(5);
    expect(result.error).toBeUndefined();
    expect(result.success).toEqual(true);
    expect(result.alreadyApplied).toEqual(true);
    expect(result.moved).toEqual(false);
    expect(result.appliedMovement).toMatchObject({ moved: true, appliedAt: AT(4) });
    expect(standing(structure)).toEqual(['challenger', 'defender']);
    expect(rankings(tournamentRecord, 'defender')).toHaveLength(history);
  });
});
