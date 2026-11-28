import POLICY_POSITION_ACTIONS_UNRESTRICTED from '@Fixtures/policies/POLICY_POSITION_ACTIONS_UNRESTRICTED';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants
import { AWAITING_RESULT, IN_PROGRESS, NOT_PLAYED, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { QUALIFYING_PARTICIPANT } from '@Constants/positionActionConstants';
import { MAIN, QUALIFYING } from '@Constants/drawDefinitionConstants';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';

const autoRemoveQualifiers = { [POLICY_TYPE_PROGRESSION]: { autoRemoveQualifiers: true } };
// a score with value and no winner: one set won, the second under way
const score = {
  sets: [
    { setNumber: 1, side1Score: 6, side2Score: 3, winningSide: 1 },
    { setNumber: 2, side1Score: 2, side2Score: 1 },
  ],
};

// a completed qualifying final whose winner has been placed in MAIN, with nothing played in MAIN yet
function placedQualifier() {
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawSize: 16,
        qualifyingProfiles: [
          { roundTarget: 1, structureProfiles: [{ stageSequence: 1, drawSize: 8, qualifyingPositions: 2 }] },
        ],
      },
    ],
    completeAllMatchUps: true,
    nonRandom: 11,
    setState: true,
  });

  const mainMatchUps = () =>
    tournamentEngine.allTournamentMatchUps({ inContext: true }).matchUps.filter(({ stage }) => stage === MAIN);
  for (const { matchUpId } of mainMatchUps().sort((a, b) => b.roundNumber - a.roundNumber)) {
    const result = tournamentEngine.setMatchUpStatus({ outcome: { matchUpStatus: TO_BE_PLAYED }, matchUpId, drawId });
    expect(result.success).toEqual(true);
  }

  const withQualifier = mainMatchUps().find(({ sides }) => sides.some(({ qualifier }) => qualifier));
  const { structureId } = withQualifier;
  const drawPosition = withQualifier.sides.find(({ qualifier }) => qualifier).drawPosition;
  const { validActions } = tournamentEngine.positionActions({
    policyDefinitions: POLICY_POSITION_ACTIONS_UNRESTRICTED,
    drawPosition,
    structureId,
    drawId,
  });
  const action = validActions.find(({ type }) => type === QUALIFYING_PARTICIPANT);
  const qualifyingParticipantId = action.qualifyingParticipantIds[0];
  expect(tournamentEngine[action.method]({ ...action.payload, qualifyingParticipantId }).success).toEqual(true);

  const qualifyingFinal = tournamentEngine
    .allTournamentMatchUps({ inContext: true })
    .matchUps.find(
      ({ stage, finishingRound, sides }) =>
        stage === QUALIFYING &&
        finishingRound === 1 &&
        sides.some(({ participantId }) => participantId === qualifyingParticipantId),
    );
  const inMain = () =>
    tournamentEngine
      .getPositionAssignments({ structureId, drawId })
      .positionAssignments.some(({ participantId }) => participantId === qualifyingParticipantId);
  expect(inMain()).toEqual(true);

  return { drawId, matchUpId: qualifyingFinal.matchUpId, inMain };
}

describe('a call that removes a placed qualifier while carrying a score', () => {
  // these statuses keep no score: the winner and the score are both cleared, so the call is a removal and reports it
  for (const matchUpStatus of [TO_BE_PLAYED, NOT_PLAYED, AWAITING_RESULT]) {
    it(`reports the qualifier removed for ${matchUpStatus}`, () => {
      const { drawId, matchUpId, inMain } = placedQualifier();
      const result: any = tournamentEngine.setMatchUpStatus({
        policyDefinitions: autoRemoveQualifiers,
        outcome: { matchUpStatus, score },
        matchUpId,
        drawId,
      });
      expect(result.success).toEqual(true);
      expect(result.qualifierRemoved).toEqual(true);
      expect(inMain()).toEqual(false);

      const { matchUp } = tournamentEngine.findMatchUp({ matchUpId, drawId });
      expect(matchUp.matchUpStatus).toEqual(matchUpStatus);
      expect(matchUp.winningSide).toBeUndefined();
    });
  }

  it('takes the qualifier out of MAIN when the call keeps its score', () => {
    const { drawId, matchUpId, inMain } = placedQualifier();
    const result: any = tournamentEngine.setMatchUpStatus({
      policyDefinitions: autoRemoveQualifiers,
      outcome: { matchUpStatus: IN_PROGRESS, score },
      matchUpId,
      drawId,
    });
    expect(result.success).toEqual(true);
    expect(inMain()).toEqual(false);

    const { matchUp } = tournamentEngine.findMatchUp({ matchUpId, drawId });
    expect(matchUp.matchUpStatus).toEqual(IN_PROGRESS);
    expect(matchUp.winningSide).toBeUndefined();
    expect(matchUp.score.scoreStringSide1).toEqual('6-3 2-1');
  });
});
