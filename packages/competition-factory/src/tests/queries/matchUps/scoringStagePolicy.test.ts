import POLICY_SCORING_DEFAULT from '@Fixtures/policies/POLICY_SCORING_DEFAULT';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants
import { CONSOLATION, FIRST_MATCH_LOSER_CONSOLATION, MAIN } from '@Constants/drawDefinitionConstants';
import { POLICY_TYPE_SCORING } from '@Constants/policyConstants';
import { SCORE } from '@Constants/matchUpActionConstants';

// A policy can require every MAIN position to be assigned before scoring; the default does not. The stage-scoped rule
// sits at the top of the scoring policy (`scoring.stage`), where every bundled policy states it.
const stageScopedOnly = {
  [POLICY_TYPE_SCORING]: {
    requireAllPositionsAssigned: false,
    stage: { [MAIN]: { stageSequence: { 1: { requireAllPositionsAssigned: true } } } },
  },
};
// the policy-level flag, which applies to every structure
const policyLevel = { [POLICY_TYPE_SCORING]: { requireAllPositionsAssigned: true } };

function partlyPositionedMain(policyDefinitions) {
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8, automated: false }],
    policyDefinitions,
    setState: true,
  });
  const { drawDefinition, event } = tournamentEngine.getEvent({ drawId });
  const structureId = drawDefinition.structures.find(({ stage }) => stage === MAIN).structureId;
  const participantIds = event.entries.map(({ participantId }) => participantId);
  const assign = (drawPosition) =>
    tournamentEngine.assignDrawPosition({
      participantId: participantIds[drawPosition - 1],
      drawPosition,
      structureId,
      drawId,
    });
  for (const drawPosition of [1, 2]) expect(assign(drawPosition).success).toEqual(true);

  const firstMatchUp = () =>
    tournamentEngine
      .allTournamentMatchUps({ inContext: true })
      .matchUps.find(({ roundNumber, drawPositions }) => roundNumber === 1 && drawPositions?.includes(1));
  const actionTypes = () =>
    tournamentEngine
      .matchUpActions({ matchUpId: firstMatchUp().matchUpId, drawId })
      .validActions.map(({ type }) => type);

  return { assign, firstMatchUp, actionTypes };
}

describe('requireAllPositionsAssigned', () => {
  for (const [name, policyDefinitions] of [
    ['a policy that requires it for MAIN stage sequence 1', stageScopedOnly],
    ['a policy that requires it at the top', policyLevel],
  ] as const) {
    it(`holds scoring in a partly positioned MAIN draw under ${name}`, () => {
      const { assign, firstMatchUp, actionTypes } = partlyPositionedMain(policyDefinitions);

      // both sides of the first matchUp are present, six of the eight positions are not
      expect(firstMatchUp().sides.every(({ participantId }) => participantId)).toEqual(true);
      expect(firstMatchUp().readyToScore).toEqual(false);
      expect(actionTypes()).not.toContain(SCORE);

      for (const drawPosition of [3, 4, 5, 6, 7, 8]) expect(assign(drawPosition).success).toEqual(true);
      expect(firstMatchUp().readyToScore).toEqual(true);
      expect(actionTypes()).toContain(SCORE);
    });
  }

  for (const [name, policyDefinitions] of [
    ['POLICY_SCORING_DEFAULT', POLICY_SCORING_DEFAULT],
    ['no policy', undefined],
  ] as const) {
    it(`scores a partly positioned MAIN draw under ${name}`, () => {
      const { firstMatchUp, actionTypes } = partlyPositionedMain(policyDefinitions);
      expect(firstMatchUp().readyToScore).toEqual(true);
      expect(actionTypes()).toContain(SCORE);
    });
  }

  it('a MAIN-only requirement does not reach a consolation that is not fully positioned', () => {
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8, drawType: FIRST_MATCH_LOSER_CONSOLATION }],
      policyDefinitions: stageScopedOnly,
      setState: true,
    });
    const stageMatchUps = (stage) =>
      tournamentEngine.allTournamentMatchUps({ inContext: true }).matchUps.filter((matchUp) => matchUp.stage === stage);
    const mainFirstRound = stageMatchUps(MAIN)
      .filter(({ roundNumber }) => roundNumber === 1)
      .sort((a, b) => a.roundPosition - b.roundPosition);
    // three of the four first-round losers reach the consolation; the fourth position stays empty
    for (const { matchUpId } of mainFirstRound.slice(0, 3)) {
      const { outcome } = mocksEngine.generateOutcomeFromScoreString({ scoreString: '6-1 6-1', winningSide: 1 });
      expect(tournamentEngine.setMatchUpStatus({ matchUpId, outcome, drawId }).success).toEqual(true);
    }

    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    const consolation = drawDefinition.structures.find(({ stage }) => stage === CONSOLATION);
    const assignments = consolation.positionAssignments;
    expect(assignments.some(({ participantId, bye, qualifier }) => !participantId && !bye && !qualifier)).toEqual(true);

    const consolationMatchUp = stageMatchUps(CONSOLATION).find(({ sides }) =>
      sides?.every(({ participantId }) => participantId),
    );
    expect(consolationMatchUp.readyToScore).toEqual(true);
    const { validActions } = tournamentEngine.matchUpActions({ matchUpId: consolationMatchUp.matchUpId, drawId });
    expect(validActions.map(({ type }) => type)).toContain(SCORE);
  });
});
