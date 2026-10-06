import { getCollectionPositionAssignments } from '@Query/hierarchical/tieFormats/getCollectionPositionAssignments';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { DOUBLES_MATCHUP, SINGLES_MATCHUP, TEAM_MATCHUP } from '@Constants/matchUpTypes';
import { INVALID_PARTICIPANT_IDS } from '@Constants/errorConditionConstants';
import { PAIR } from '@Constants/participantConstants';
import { TEAM_EVENT } from '@Constants/eventConstants';

function setUpTeamDual() {
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 2, eventType: TEAM_EVENT }],
    setState: true,
  });

  const dualMatchUp = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: { matchUpTypes: [TEAM_MATCHUP] },
  }).matchUps[0];
  const sideOne = dualMatchUp.sides.find(({ sideNumber }) => sideNumber === 1);
  const sideTwo = dualMatchUp.sides.find(({ sideNumber }) => sideNumber === 2);
  const teamOneMemberIds: string[] = sideOne.participant.individualParticipantIds;
  const teamTwoMemberIds: string[] = sideTwo.participant.individualParticipantIds;

  const getTieMatchUp = (matchUpType: string) =>
    tournamentEngine
      .allTournamentMatchUps({ matchUpFilters: { matchUpTypes: [matchUpType] } })
      .matchUps.find(({ matchUpTieId }) => matchUpTieId === dualMatchUp.matchUpId);

  return { drawId, dualMatchUp, teamOneMemberIds, teamTwoMemberIds, getTieMatchUp };
}

it('a second substitution in a tie matchUp gets order 2', () => {
  const { drawId, teamOneMemberIds, getTieMatchUp } = setUpTeamDual();
  const singles = getTieMatchUp(SINGLES_MATCHUP);
  const [first, second, third] = teamOneMemberIds;

  let result: any = tournamentEngine.assignTieMatchUpParticipantId({
    tieMatchUpId: singles.matchUpId,
    participantId: first,
    drawId,
  });
  expect(result.success).toEqual(true);

  result = tournamentEngine.replaceTieMatchUpParticipantId({
    tieMatchUpId: singles.matchUpId,
    existingParticipantId: first,
    newParticipantId: second,
    substitution: true,
    drawId,
  });
  expect(result.success).toEqual(true);

  result = tournamentEngine.replaceTieMatchUpParticipantId({
    tieMatchUpId: singles.matchUpId,
    existingParticipantId: second,
    newParticipantId: third,
    substitution: true,
    drawId,
  });
  expect(result.success).toEqual(true);

  const { collectionId, collectionPosition } = singles;
  const orderOf = (participantId: string) =>
    result.modifiedLineUp
      .find((teamCompetitor) => teamCompetitor.participantId === participantId)
      ?.collectionAssignments.find(
        (assignment) =>
          assignment.collectionId === collectionId && assignment.collectionPosition === collectionPosition,
      )?.substitutionOrder;

  expect(orderOf(first)).toEqual(0);
  expect(orderOf(second)).toEqual(1);
  expect(orderOf(third)).toEqual(2);

  const { assignedParticipantIds, substitutions } = getCollectionPositionAssignments({
    lineUp: result.modifiedLineUp,
    collectionPosition,
    collectionId,
  });
  expect(assignedParticipantIds).toEqual([third]);
  expect(substitutions.map(({ substitutionOrder }) => substitutionOrder)).toEqual([1, 2]);

  const side = getTieMatchUp(SINGLES_MATCHUP).sides.find(({ sideNumber }) => sideNumber === 1);
  expect(side.participant.participantId).toEqual(third);
});

it('replacing a doubles pair with a pair participant returns the pair creation error', () => {
  const { drawId, teamOneMemberIds, getTieMatchUp } = setUpTeamDual();
  const doubles = getTieMatchUp(DOUBLES_MATCHUP);
  const [first, second] = teamOneMemberIds;

  for (const participantId of [first, second]) {
    const result: any = tournamentEngine.assignTieMatchUpParticipantId({
      tieMatchUpId: doubles.matchUpId,
      participantId,
      drawId,
    });
    expect(result.success).toEqual(true);
  }

  const pairOnSide = getTieMatchUp(DOUBLES_MATCHUP).sides.find(({ sideNumber }) => sideNumber === 1).participant;
  expect(pairOnSide.participantType).toEqual(PAIR);

  const otherPair = tournamentEngine
    .getParticipants({ participantFilters: { participantTypes: [PAIR] } })
    .participants.find(({ participantId }) => participantId !== pairOnSide.participantId);
  expect(otherPair).toBeDefined();

  const result: any = tournamentEngine.replaceTieMatchUpParticipantId({
    existingParticipantId: pairOnSide.participantId,
    newParticipantId: otherPair.participantId,
    tieMatchUpId: doubles.matchUpId,
    drawId,
  });
  expect(result.error).toEqual(INVALID_PARTICIPANT_IDS);
});
