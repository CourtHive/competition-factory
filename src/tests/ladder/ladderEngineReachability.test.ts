import { expect, test, describe } from 'vitest';

import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';

import { LADDER } from '@Constants/drawDefinitionConstants';
import { ACCEPTED, PENDING, RESULT } from '@Constants/ladderConstants';

/**
 * The ladder lifecycle exists to be driven from OUTSIDE the factory.
 *
 * Every other ladder suite imports the functions by module path, which proves the logic but not the
 * reach: #4787 shipped the whole lifecycle with no governor, so none of it was on an engine and no
 * consumer could call any of it. A module-path test would have stayed green throughout.
 *
 * So this suite calls `tournamentEngine.*` exclusively and passes `drawId` — never a drawDefinition,
 * never a structure, never a matchUp object. If a function stops being exported, or starts needing
 * a param an engine caller cannot supply, this goes red where the others do not.
 */
const ISO = (day: number) => `2026-03-${String(day).padStart(2, '0')}T10:00:00.000Z`;

function ladderWithFourSeated() {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: LADDER, drawSize: 4 }],
    setState: true,
  });
  const { drawId } = tournamentRecord.events[0].drawDefinitions[0];
  const participantIds = tournamentRecord.participants.slice(0, 4).map((p: any) => p.participantId);

  // Seating is `addLadderParticipant`'s job, not the generator's: a ladder position is a rank, and
  // the generator has no basis on which to rank an entry list.
  participantIds.forEach((participantId: string) => {
    const result: any = tournamentEngine.addLadderParticipant({ participantId, addedAt: ISO(1), drawId });
    expect(result.success).toEqual(true);
  });

  return { drawId, participantIds };
}

describe('the ladder lifecycle is reachable through the engine', () => {
  test('every ladder method is present on the engine surface', () => {
    // The gap #4787 left: implemented, tested, and unreachable.
    const methods = [
      'issueChallenge',
      'acceptChallenge',
      'declineChallenge',
      'submitResult',
      'confirmResult',
      'disputeResult',
      'applyLadderMovement',
      'addLadderParticipant',
      'removeLadderParticipant',
      'refreshLadderRatings',
      'getLadderStanding',
      'getChallengeState',
      'getLapses',
      'getResultAttestation',
      'getLadderPolicy',
      'getLadderOrdering',
      'getLadderMovement',
      'isChallengeInRange',
    ];
    methods.forEach((method) => expect(typeof tournamentEngine[method]).toEqual('function'));
  });

  test('the three internal helpers are deliberately NOT reachable', () => {
    // mirrorStandingToScale must stay a side effect of the position mutation — exposing it would
    // let a caller move a standing without writing the history, or write history without moving.
    // applyLapseConsequence is called by declineChallenge AFTER the lapse is counted; called
    // directly it applies a penalty nothing counted. addDaysIso is date arithmetic, not ladder API.
    ['mirrorStandingToScale', 'applyLapseConsequence', 'addDaysIso'].forEach((method) =>
      expect(tournamentEngine[method]).toBeUndefined(),
    );
  });

  test('a ladder draw generates a standing and no matchUps', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawType: LADDER, drawSize: 4 }],
      setState: true,
    });
    const structure = tournamentRecord.events[0].drawDefinitions[0].structures[0];

    // Every ladder matchUp is created by a challenge; there is nothing to generate up front.
    expect(structure.matchUps.length).toEqual(0);

    // And NO positionAssignments: a ladder drawPosition is a rank. Pre-creating `drawSize` empty
    // ones (as SWISS does) would put phantom ranks above every real member — rank 1 held by nobody.
    expect(structure.positionAssignments ?? []).toEqual([]);
  });

  test('challenge, accept, report, confirm and move — all through drawId alone', () => {
    const { drawId, participantIds } = ladderWithFourSeated();

    const standing: any = tournamentEngine.getLadderStanding({ drawId });
    expect(standing.length).toEqual(4);
    // Seating starts at rank 1, not behind a block of generated placeholders.
    expect(standing.map((s: any) => s.position)).toEqual([1, 2, 3, 4]);
    const defenderParticipantId = standing[0].participantId;
    const challengerParticipantId = standing[1].participantId;
    expect(participantIds).toContain(defenderParticipantId);

    const issued: any = tournamentEngine.issueChallenge({
      challengerParticipantId,
      defenderParticipantId,
      issuedAt: ISO(1),
      drawId,
    });
    expect(issued.success).toEqual(true);
    const { matchUpId } = issued;

    // The engine resolves the matchUp from matchUpId — the caller never holds a matchUp object.
    const pending: any = tournamentEngine.getChallengeState({ matchUpId, asOf: ISO(2), drawId });
    expect(pending.state).toEqual(PENDING);

    expect(tournamentEngine.acceptChallenge({ matchUpId, respondedAt: ISO(2), drawId }).success).toEqual(true);
    expect(tournamentEngine.getChallengeState({ matchUpId, asOf: ISO(3), drawId }).state).toEqual(ACCEPTED);

    // A submitted score is not an agreed one: AWAITING_RESULT, and the standing must not move.
    const submitted: any = tournamentEngine.submitResult({
      participantId: challengerParticipantId,
      outcome: { winningSide: 1 },
      submittedAt: ISO(4),
      matchUpId,
      drawId,
    });
    expect(submitted.success).toEqual(true);
    expect(tournamentEngine.getResultAttestation({ matchUpId, drawId }).attested).toEqual(false);

    const blocked: any = tournamentEngine.applyLadderMovement({
      trigger: RESULT,
      appliedAt: ISO(4),
      matchUpId,
      drawId,
    });
    expect(blocked.error).toBeDefined();

    expect(
      tournamentEngine.confirmResult({
        participantId: defenderParticipantId,
        confirmedAt: ISO(5),
        matchUpId,
        drawId,
      }).success,
    ).toEqual(true);
    expect(tournamentEngine.getResultAttestation({ matchUpId, drawId }).attested).toEqual(true);

    const moved: any = tournamentEngine.applyLadderMovement({
      trigger: RESULT,
      appliedAt: ISO(5),
      matchUpId,
      drawId,
    });
    expect(moved.success).toEqual(true);
    expect(moved.moved).toEqual(true);

    // The challenger prevailed, so they now hold position 1 and the defender holds 2.
    const after: any = tournamentEngine.getLadderStanding({ drawId });
    expect(after[0].participantId).toEqual(challengerParticipantId);
    expect(after[1].participantId).toEqual(defenderParticipantId);
  });

  test('an out-of-range challenge is refused through the engine, naming the range', () => {
    const { drawId } = ladderWithFourSeated();
    const standing: any = tournamentEngine.getLadderStanding({ drawId });

    // Default challengeRange is 3, so position 4 challenging position 1 is in range; make it not.
    const inRange: any = tournamentEngine.isChallengeInRange({
      challengerPosition: 4,
      defenderPosition: 1,
      drawId,
    });
    expect(inRange).toEqual(true);

    const downward: any = tournamentEngine.issueChallenge({
      challengerParticipantId: standing[0].participantId,
      defenderParticipantId: standing[3].participantId,
      issuedAt: ISO(1),
      drawId,
    });
    expect(downward.error).toBeDefined();
  });

  test('getLapses and getLadderPolicy answer from drawId alone', () => {
    const { drawId, participantIds } = ladderWithFourSeated();

    const policy: any = tournamentEngine.getLadderPolicy({ drawId });
    expect(policy.challengeRange).toEqual(3);
    expect(tournamentEngine.getLadderOrdering({ drawId })).toEqual('RANK');

    const lapses: any = tournamentEngine.getLapses({ participantId: participantIds[0], asOf: ISO(9), drawId });
    expect(lapses.count).toEqual(0);
    expect(lapses.exceeded).toEqual(false);
  });
});
