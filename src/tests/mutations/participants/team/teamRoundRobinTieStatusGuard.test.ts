import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

// constants
import { POLICY_TYPE_SCORING } from '@Constants/policyConstants';
import { ROUND_ROBIN } from '@Constants/drawDefinitionConstants';
import { COMPLETED } from '@Constants/matchUpStatusConstants';
import { TEAM } from '@Constants/eventConstants';

// Coverage/regression for the teamRoundRobinContext guard in attemptToSetMatchUpStatus.
// It read the misspelled matchUp.rondPosition (always undefined); corrected to
// matchUp.roundPosition. Team round-robin tie matchUps carry no roundPosition, so the
// guard is behaviour-neutral today — this test locks that invariant (if RR ties ever
// gain a roundPosition the guard's meaning shifts) and confirms a container tie still
// completes through the teamRoundRobinContext score-modification path.
it('completes a TEAM ROUND_ROBIN tie through the container tie matchUp path', () => {
  const policyDefinitions = { [POLICY_TYPE_SCORING]: { requireParticipantsForScoring: false } };
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    policyDefinitions,
    drawProfiles: [{ drawType: ROUND_ROBIN, eventType: TEAM, drawSize: 4 }],
    setState: true,
  });

  const teamMatchUps = () =>
    tournamentEngine.allTournamentMatchUps({ matchUpFilters: { matchUpTypes: [TEAM] } }).matchUps;

  const tie = teamMatchUps().find((m) => m.tieMatchUps?.length && m.containerStructureId);
  expect(tie).toBeDefined();
  // invariant the guard relies on: RR container tie matchUps have no roundPosition
  expect(tie.roundPosition).toBeUndefined();

  for (const collectionMatchUp of tie.tieMatchUps) {
    const { outcome } = mocksEngine.generateOutcomeFromScoreString({
      scoreString: '6-0 6-0',
      matchUpStatus: COMPLETED,
      winningSide: 1,
    });
    const result: any = tournamentEngine.setMatchUpStatus({ matchUpId: collectionMatchUp.matchUpId, outcome, drawId });
    expect(result.success).toEqual(true);
  }

  const updated = teamMatchUps().find((m) => m.matchUpId === tie.matchUpId);
  expect(updated.winningSide).toEqual(1);
});
