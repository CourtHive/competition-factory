import { isMatchUpEventType } from '@Helpers/matchUpEventTypes/isMatchUpEventType';
import { setSubscriptions } from '@Global/state/globalState';
import { getMatchUpId } from '@Functions/global/extractors';
import { mocksEngine } from '@Assemblies/engines/mock';
import { tournamentEngine } from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { COLLEGE_DEFAULT, DOMINANT_DUO } from '@Constants/tieFormatConstants';
import { ADD_MATCHUPS, DELETED_MATCHUP_IDS } from '@Constants/topicConstants';
import { SCORES_PRESENT } from '@Constants/errorConditionConstants';
import { POLICY_TYPE_SCORING } from '@Constants/policyConstants';
import { DEFAULTED } from '@Constants/matchUpStatusConstants';
import { AD_HOC } from '@Constants/drawDefinitionConstants';
import { SINGLES, TEAM } from '@Constants/eventConstants';

// testing for generation of addMatchUps notifications for tieMatchUps in AD_HOC TEAM events
// each scenario generates a different number of matchUps due to different tieFormats having different collectionDefinitions
const scenarios = [
  { drawProfile: { tieFormatName: COLLEGE_DEFAULT, drawSize: 4 }, expectation: { added: 20 } },
  { drawProfile: { tieFormatName: DOMINANT_DUO, drawSize: 4 }, expectation: { added: 8 } },
];

const policyDefinitions = { [POLICY_TYPE_SCORING]: { requireParticipantsForScoring: false } };

it.each(scenarios)('generates addMatchUps notifications for tieMatchUps in AD_HOC TEAM events', (scenario) => {
  const addedMatchUpIds: string[] = [];
  const deletedMatchUpIds: string[] = [];
  const subscriptions = {
    [ADD_MATCHUPS]: (payload) => {
      if (Array.isArray(payload)) {
        payload.forEach((item) => {
          const matchUpIds = item.matchUps.map(getMatchUpId);
          addedMatchUpIds.push(...matchUpIds);
        });
      }
    },
    [DELETED_MATCHUP_IDS]: (notices) => {
      notices.forEach(({ matchUpIds }) => deletedMatchUpIds.push(...matchUpIds));
    },
  };

  setSubscriptions({ subscriptions });

  const drawId = 'drawId';
  const result = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      { ...scenario.drawProfile, drawType: AD_HOC, automated: true, eventType: TEAM, roundsCount: 1, drawId },
    ],
    policyDefinitions,
    setState: true,
  });
  expect(result.success).toEqual(true);
  expect(addedMatchUpIds.length).toEqual(scenario.expectation.added);

  const matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
  expect(matchUps.length).toEqual(scenario.expectation.added);

  const teamMatchUps = matchUps.filter(isMatchUpEventType(TEAM));
  const targetTeamMatchUp = teamMatchUps[0];
  const targetTieMatchUp = targetTeamMatchUp.tieMatchUps.find(isMatchUpEventType(SINGLES));
  const targetSide = targetTeamMatchUp.sides[0];
  const targetIndividualParticipant = targetSide.participant.individualParticipants[0];
  const assignmentResult = tournamentEngine.assignTieMatchUpParticipantId({
    participantId: targetIndividualParticipant.participantId,
    tieMatchUpId: targetTieMatchUp.matchUpId,
    drawId,
  });
  expect(assignmentResult.success).toEqual(true);
  expect(assignmentResult.modifiedLineUp[0].participantId).toEqual(targetIndividualParticipant.participantId);

  let tieMatchUp = tournamentEngine.findMatchUp({ drawId, matchUpId: targetTieMatchUp.matchUpId }).matchUp;
  const participantsCount = tieMatchUp.sides.reduce((count, side) => count + (side.participant ? 1 : 0), 0);
  expect(participantsCount).toEqual(1);

  const statusResult = tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: DEFAULTED, winningSide: 1 },
    matchUpId: targetTieMatchUp.matchUpId,
    drawId,
  });
  expect(statusResult.success).toEqual(true);
  tieMatchUp = tournamentEngine.findMatchUp({ drawId, matchUpId: targetTieMatchUp.matchUpId }).matchUp;
  expect(tieMatchUp.winningSide).toEqual(1);

  const teamMatchUpIds = tournamentEngine
    .allTournamentMatchUps({ matchUpFilters: { matchUpTypes: [TEAM] } })
    .matchUps.map(getMatchUpId);

  let deletionResult = tournamentEngine.deleteAdHocMatchUps({
    matchUpIds: teamMatchUpIds,
    drawId,
  });
  expect(deletionResult.success).toEqual(true);
  // only half are deleted because the other half are "incomplete" and not removed by default
  expect(deletionResult.deletedMatchUpsCount).toEqual(scenario.expectation.added / 2);

  deletionResult = tournamentEngine.deleteAdHocMatchUps({
    matchUpIds: teamMatchUpIds,
    drawId,
  });
  expect(deletionResult.error).toEqual(SCORES_PRESENT);

  deletionResult = tournamentEngine.deleteAdHocMatchUps({
    matchUpIds: teamMatchUpIds,
    removeIncomplete: true,
    drawId,
  });
  expect(deletionResult.success).toEqual(true);
  expect(deletionResult.deletedMatchUpsCount).toEqual(scenario.expectation.added / 2);

  expect(deletedMatchUpIds.length).toEqual(scenario.expectation.added);
});
