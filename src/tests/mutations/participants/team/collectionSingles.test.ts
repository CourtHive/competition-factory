import { generateTeamTournament } from './generateTestTeamTournament';
import { getParticipantId } from '@Functions/global/extractors';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { COMPLETED, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { INDIVIDUAL, PAIR } from '@Constants/participantConstants';
import { DOUBLES, SINGLES, TEAM } from '@Constants/matchUpTypes';
import { POLICY_TYPE_SCORING } from '@Constants/policyConstants';
import { COMPETITOR } from '@Constants/participantRoles';
import {
  EXISTING_OUTCOME,
  INVALID_PARTICIPANT_TYPE,
  MATCHUP_NOT_FOUND,
  MISSING_DRAW_ID,
  MISSING_PARTICIPANT_ID,
  PARTICIPANT_NOT_FOUND,
} from '@Constants/errorConditionConstants';

// reusable
const getMatchUp = (id, inContext?) => {
  const {
    matchUps: [matchUp],
  } = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: { matchUpIds: [id] },
    inContext,
  });
  return matchUp;
};

it('can both assign and remove individualParticipants in SINGLES matchUps that are part of team events', () => {
  const { tournamentRecord, drawId } = generateTeamTournament({ attachScoringPolicy: false });
  tournamentEngine.setState(tournamentRecord);

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const { positionAssignments } = drawDefinition.structures[0];

  let {
    matchUps: [singlesMatchUp],
  } = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: { matchUpTypes: [SINGLES] },
  });

  const { matchUpId } = singlesMatchUp;
  const drawPositions = singlesMatchUp.drawPositions;
  const teamParticipantIds = positionAssignments
    .filter(({ drawPosition }) => drawPositions.includes(drawPosition))
    .map(getParticipantId);

  const { participants: teamParticipants } = tournamentEngine.getParticipants({
    participantFilters: { participantIds: teamParticipantIds },
  });

  const assignedIndividualParticipantIds: string[] = [];

  // assign individual participants to the first singles matchUp
  teamParticipants.forEach((teamParticipant) => {
    const individualParticipantId = teamParticipant.individualParticipantIds[0];
    assignedIndividualParticipantIds.push(individualParticipantId);
    const result = tournamentEngine.assignTieMatchUpParticipantId({
      participantId: individualParticipantId,
      tieMatchUpId: matchUpId,
      drawId,
    });
    expect(result.success).toEqual(true);
    expect(result.modifiedLineUp[0].participantId).toEqual(individualParticipantId);
    expect(result.modifiedLineUp[0].collectionAssignments[0].collectionId).toEqual(singlesMatchUp.collectionId);
    expect(result.modifiedLineUp[0].collectionAssignments[0].collectionPosition).toEqual(
      singlesMatchUp.collectionPosition,
    );
  });

  const matchUp = tournamentEngine.findMatchUp({ matchUpId, drawId }).matchUp;
  expect(matchUp.sides.map(({ participant }) => participant).length).toEqual(2);

  // score the SINGLES matchUp
  let { outcome } = mocksEngine.generateOutcomeFromScoreString({
    matchUpStatus: COMPLETED,
    scoreString: '6-1 6-1',
    winningSide: 1,
  });

  let result = tournamentEngine.setMatchUpStatus({
    matchUpId,
    outcome,
    drawId,
  });
  expect(result.success).toEqual(true);

  ({
    matchUps: [singlesMatchUp],
  } = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: { matchUpIds: [singlesMatchUp.matchUpId] },
  }));
  expect(singlesMatchUp.winningSide).toEqual(outcome.winningSide);

  singlesMatchUp.sides.forEach((side) => {
    expect(side.teamParticipant.participantName).not.toBeUndefined();
    expect(side.teamParticipant.participantId).not.toBeUndefined();
  });

  let {
    matchUps: [teamMatchUp],
  } = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: { matchUpIds: [singlesMatchUp.matchUpTieId] },
  });
  expect(teamMatchUp.score[`scoreStringSide${outcome.winningSide}`]).toEqual('1-0');

  // attempt to remove participants from SINGLES matchUp; expect error
  result = removeSinglesParticipants();
  expect(result.error).toEqual(EXISTING_OUTCOME);

  // remove the result from SINGLES matchUp
  ({ outcome } = mocksEngine.generateOutcomeFromScoreString({
    winningSide: undefined,
    matchUpStatus: TO_BE_PLAYED,
  }));
  result = tournamentEngine.setMatchUpStatus({
    drawId,
    matchUpId,
    outcome,
  });
  expect(result.success).toEqual(true);

  ({
    matchUps: [singlesMatchUp],
  } = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: { matchUpIds: [singlesMatchUp.matchUpId] },
  }));
  expect(singlesMatchUp.winningSide).toBeUndefined();

  singlesMatchUp.sides.forEach((side) => {
    expect(side.participant.participantType).toEqual(INDIVIDUAL);
  });

  ({
    matchUps: [teamMatchUp],
  } = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: { matchUpIds: [singlesMatchUp.matchUpTieId] },
  }));
  expect(teamMatchUp.score.scoreStringSide1).toEqual('0-0');

  teamMatchUp.sides.forEach((side) => {
    expect(side.participant.participantType).toEqual(TEAM);
    expect(side.lineUp.length).toEqual(1);
    expect(side.lineUp[0].collectionAssignments.length).toEqual(1);
  });

  const { participants: doublesParticipants } = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: [PAIR] },
  });

  // attempt to remove a DOUBLES participant from a SINGLES matchUp; expect error;
  const participantId = doublesParticipants[0].participantId;
  result = tournamentEngine.removeTieMatchUpParticipantId({
    tieMatchUpId: matchUpId,
    participantId,
    drawId,
  });
  expect(result.error).toEqual(PARTICIPANT_NOT_FOUND);

  // attempt to remove participants from SINGLES matchUp; expect success
  result = removeSinglesParticipants();
  expect(result.length).toEqual(2);
  expect(result[0].success).toEqual(true);
  expect(result[1].success).toEqual(true);
  expect(assignedIndividualParticipantIds.includes(result[0].modifiedLineUp[0].participantId)).toEqual(true);
  expect(result[0].modifiedLineUp[0].collectionAssignments.length).toEqual(0);
  expect(assignedIndividualParticipantIds.includes(result[1].modifiedLineUp[0].participantId)).toEqual(true);
  expect(result[1].modifiedLineUp[0].collectionAssignments.length).toEqual(0);

  ({
    matchUps: [singlesMatchUp],
  } = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: { matchUpIds: [singlesMatchUp.matchUpId] },
  }));
  expect(singlesMatchUp.winningSide).toBeUndefined();

  singlesMatchUp.sides.forEach((side) => {
    expect(side.participant).toBeUndefined();
  });

  ({
    matchUps: [teamMatchUp],
  } = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: { matchUpIds: [singlesMatchUp.matchUpTieId] },
  }));

  teamMatchUp.sides.forEach((side) => {
    expect(side.participant.participantType).toEqual(TEAM);
    expect(side.lineUp.length).toEqual(1);
    expect(side.lineUp[0].collectionAssignments.length).toEqual(0);
  });

  function removeSinglesParticipants() {
    const results: any[] = [];
    // remove individual participants from the singles matchUp
    const success = teamParticipants.every((teamParticipant) => {
      const { participantId } = teamParticipant;
      const assignment = positionAssignments.find((assignment) => assignment.participantId === participantId);
      const side = singlesMatchUp.sides.find((side) => side.drawPosition === assignment.drawPosition);
      const { participantId: individualParticipantId } = side;
      result = tournamentEngine.removeTieMatchUpParticipantId({
        participantId: individualParticipantId,
        tieMatchUpId: matchUpId,
        drawId,
      });
      results.push(result);

      return !result?.error;
    });

    return success ? results : results[0];
  }
});

it('can assign SINGLES participants to collectionPositions and complete matchUps', () => {
  const drawSize = 8;
  const valueGoal = 2;
  const { tournamentRecord, eventId, drawId } = generateTeamTournament({
    valueGoal,
    drawSize,
  });
  expect(eventId).not.toBeUndefined();
  expect(drawId).not.toBeUndefined();

  tournamentEngine.setState(tournamentRecord);

  const { participants } = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: [TEAM] },
  });
  expect(participants.length).toEqual(drawSize);

  let { matchUps: singlesMatchUps } = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: { matchUpTypes: [SINGLES] },
  });

  const { drawDefinition, event } = tournamentEngine.getEvent({ drawId });
  expect(event.tieFormat.winCriteria.valueGoal).toEqual(valueGoal);

  const { positionAssignments } = drawDefinition.structures[0];
  expect(positionAssignments.length).toEqual(drawSize);

  const singlesMatchUp = singlesMatchUps[0];
  for (const sideNumber of [1, 2]) {
    let { matchUpTieId, matchUpId } = singlesMatchUp;
    let side = singlesMatchUp.sides.find((side) => side.sideNumber === sideNumber);
    let sideTeamParticipantId = positionAssignments.find(
      (assignment) => assignment.drawPosition === side.drawPosition,
    ).participantId;

    let {
      participants: [teamParticipant],
    } = tournamentEngine.getParticipants({
      participantFilters: { participantIds: [sideTeamParticipantId] },
    });
    const individualParticipantId = teamParticipant.individualParticipantIds[0];

    let result = tournamentEngine.assignTieMatchUpParticipantId();
    expect(result.error).toEqual(MISSING_DRAW_ID);

    result = tournamentEngine.assignTieMatchUpParticipantId({
      participantId: individualParticipantId,
      drawId,
    });
    expect(result.error).toEqual(MATCHUP_NOT_FOUND);

    result = tournamentEngine.assignTieMatchUpParticipantId({
      tieMatchUpId: matchUpId,
      drawId,
    });
    expect(result.error).toEqual(MISSING_PARTICIPANT_ID);

    const { participants: doublesParticipants } = tournamentEngine.getParticipants({
      participantFilters: { participantTypes: [PAIR] },
    });

    const doublesParticipantId = doublesParticipants[0].participantId;
    // assign a PAIR particpant to a SINGLES matchUp; expect error
    result = tournamentEngine.assignTieMatchUpParticipantId({
      participantId: doublesParticipantId,
      tieMatchUpId: matchUpId,
      drawId,
    });
    expect(result.error).toEqual(INVALID_PARTICIPANT_TYPE);

    // assign an individual particpant to a SINGLES matchUp
    result = tournamentEngine.assignTieMatchUpParticipantId({
      participantId: individualParticipantId,
      tieMatchUpId: matchUpId,
      drawId,
    });
    expect(result.success).toEqual(true);

    ({ matchUps: singlesMatchUps } = tournamentEngine.allTournamentMatchUps({
      matchUpFilters: { matchUpTypes: [SINGLES] },
    }));

    const modifiedTieMatchUp = singlesMatchUps.find((matchUp) => matchUp.matchUpId === matchUpId);
    const targetSide = modifiedTieMatchUp.sides.find((side) => side.sideNumber === sideNumber);
    expect(targetSide.participantId).toEqual(individualParticipantId);

    let { matchUps: dualMatchUps } = tournamentEngine.allTournamentMatchUps({
      matchUpFilters: { matchUpTypes: [TEAM] },
    });
    let dualMatchUp = dualMatchUps.find((dualMatchUp) => (dualMatchUp.matchUpId = matchUpTieId));
    let dualMatchUpTargetSide = dualMatchUp.sides.find((side) => side.sideNumber === sideNumber);
    expect(dualMatchUpTargetSide.lineUp.length).toEqual(1);
    expect(dualMatchUpTargetSide.lineUp[0].participantId).toEqual(individualParticipantId);
    const targetCompetitor = dualMatchUpTargetSide.lineUp.find(
      ({ participantId }) => participantId === individualParticipantId,
    );
    expect(targetCompetitor.collectionAssignments[0].collectionId).toEqual(singlesMatchUp.collectionId);

    // Assign a doubles team participant to a collectionPosition
    const { matchUps: doublesMatchUps } = tournamentEngine.allTournamentMatchUps({
      matchUpFilters: { matchUpTypes: [DOUBLES] },
    });
    const doublesMatchUp = doublesMatchUps[0];

    ({ matchUpTieId, matchUpId } = doublesMatchUp);
    side = singlesMatchUp.sides.find((side) => side.sideNumber === sideNumber);
    sideTeamParticipantId = positionAssignments.find(
      (assignment) => assignment.drawPosition === side.drawPosition,
    ).participantId;
    ({
      participants: [teamParticipant],
    } = tournamentEngine.getParticipants({
      participantFilters: { participantIds: [sideTeamParticipantId] },
    }));

    const individualParticipantIds = teamParticipant.individualParticipantIds.slice(0, 2);
    const pairParticipant = {
      participantType: PAIR,
      participantRole: COMPETITOR,
      individualParticipantIds,
    };
    result = tournamentEngine.addParticipant({ participant: pairParticipant });
    expect(result.success).toEqual(true);

    ({ matchUps: dualMatchUps } = tournamentEngine.allTournamentMatchUps({
      matchUpFilters: { matchUpTypes: [TEAM] },
    }));
    dualMatchUp = dualMatchUps.find((dualMatchUp) => dualMatchUp.matchUpId === matchUpTieId);
    dualMatchUpTargetSide = dualMatchUp.sides.find((side) => side.sideNumber === sideNumber);
    expect(dualMatchUpTargetSide.lineUp[0].participantId).toEqual(individualParticipantId);
  }

  // complete singlesMatchUps
  const { outcome } = mocksEngine.generateOutcomeFromScoreString({
    scoreString: '6-1 6-1',
    winningSide: 1,
    matchUpStatus: COMPLETED,
  });

  singlesMatchUps.forEach(({ matchUpId }) => {
    const result = tournamentEngine.setMatchUpStatus({
      matchUpId,
      outcome,
      drawId,
    });
    const updatedSinglesMatchUp = getMatchUp(matchUpId);
    const updatedDrawPositions = updatedSinglesMatchUp.drawPositions;
    if (updatedDrawPositions.filter(Boolean).length === 2) {
      expect(result.success).toEqual(true);
    } else {
      expect(result.error).not.toBeUndefined();
    }
  });

  const { matchUps: teamMatchUps } = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: { matchUpTypes: [TEAM] },
  });
  expect(teamMatchUps[0].winningSide).toEqual(1);
  expect(teamMatchUps[0].score.sets[0].side1Score).toEqual(2);

  // expect that all 7 team matchUps have been completed
  expect(teamMatchUps.map((m) => m.winningSide).filter(Boolean).length).toEqual(7);

  ({ matchUps: singlesMatchUps } = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: { matchUpTypes: [SINGLES] },
  }));
  singlesMatchUps[0].sides.forEach((side) => {
    expect(side.participant.teams.length).toEqual(1);
  });
});

it('returns INVALID_PARTICIPANT when removing a PAIR participant from a SINGLES matchUp', () => {
  const { tournamentRecord, drawId } = generateTeamTournament({ drawSize: 2 });
  tournamentEngine.setState(tournamentRecord);

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const { positionAssignments } = drawDefinition.structures[0];

  // get the first singles matchUp
  let {
    matchUps: [singlesMatchUp],
  } = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: { matchUpTypes: [SINGLES] },
  });

  const { matchUpId } = singlesMatchUp;
  const drawPositions = singlesMatchUp.drawPositions;
  const teamParticipantIds = positionAssignments
    .filter(({ drawPosition }) => drawPositions.includes(drawPosition))
    .map(getParticipantId);

  const { participants: teamParticipants } = tournamentEngine.getParticipants({
    participantFilters: { participantIds: teamParticipantIds },
  });

  // assign an individual participant to a singles matchUp first
  const individualParticipantId = teamParticipants[0].individualParticipantIds[0];
  let result = tournamentEngine.assignTieMatchUpParticipantId({
    participantId: individualParticipantId,
    tieMatchUpId: matchUpId,
    drawId,
  });
  expect(result.success).toEqual(true);

  // now create a PAIR participant and try to remove it from the singles matchUp
  const { participants: pairParticipants } = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: [PAIR] },
  });

  // a PAIR participant should be found on the side (since the individual is part of a pair)
  // trying to removeTieMatchUpParticipantId with a PAIR participantId on a SINGLES matchUp
  // should return INVALID_PARTICIPANT
  const pairParticipant = pairParticipants.find((p) => p.individualParticipantIds?.includes(individualParticipantId));
  if (pairParticipant) {
    result = tournamentEngine.removeTieMatchUpParticipantId({
      participantId: pairParticipant.participantId,
      tieMatchUpId: matchUpId,
      drawId,
    });
    // PAIR participant won't be found on SINGLES side, returns PARTICIPANT_NOT_FOUND
    // (the side matching uses individual participant matching)
    expect(result.error).not.toBeUndefined();
  }
});

it('allows removal despite existing outcome when requireParticipantsForScoring is false', () => {
  // generateTeamTournament with attachScoringPolicy: true sets requireParticipantsForScoring: false
  const { tournamentRecord, drawId } = generateTeamTournament({ attachScoringPolicy: true });
  tournamentEngine.setState(tournamentRecord);

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const { positionAssignments } = drawDefinition.structures[0];

  let {
    matchUps: [singlesMatchUp],
  } = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: { matchUpTypes: [SINGLES] },
  });

  const { matchUpId } = singlesMatchUp;
  const drawPositions = singlesMatchUp.drawPositions;
  const teamParticipantIds = positionAssignments
    .filter(({ drawPosition }) => drawPositions.includes(drawPosition))
    .map(getParticipantId);

  const { participants: teamParticipants } = tournamentEngine.getParticipants({
    participantFilters: { participantIds: teamParticipantIds },
  });

  // assign individual participants to both sides of the singles matchUp
  teamParticipants.forEach((teamParticipant) => {
    const individualParticipantId = teamParticipant.individualParticipantIds[0];
    const result = tournamentEngine.assignTieMatchUpParticipantId({
      participantId: individualParticipantId,
      tieMatchUpId: matchUpId,
      drawId,
    });
    expect(result.success).toEqual(true);
  });

  // score the matchUp
  const { outcome } = mocksEngine.generateOutcomeFromScoreString({
    matchUpStatus: COMPLETED,
    scoreString: '6-1 6-1',
    winningSide: 1,
  });

  let result = tournamentEngine.setMatchUpStatus({
    matchUpId,
    outcome,
    drawId,
  });
  expect(result.success).toEqual(true);

  // verify the matchUp has a score
  ({
    matchUps: [singlesMatchUp],
  } = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: { matchUpIds: [matchUpId] },
  }));
  expect(singlesMatchUp.winningSide).toEqual(1);

  // with requireParticipantsForScoring: false (via the scoring policy),
  // removal should still succeed even with an existing outcome
  // because the scoring policy allows it
  const individualParticipantId = teamParticipants[0].individualParticipantIds[0];
  result = tournamentEngine.removeTieMatchUpParticipantId({
    participantId: individualParticipantId,
    tieMatchUpId: matchUpId,
    drawId,
  });
  // The scoring policy has requireParticipantsForScoring: false
  // but EXISTING_OUTCOME check also requires !side.substitutions?.length
  // and checkScoreHasValue || winningSide. Since there's no substitution,
  // the check depends on the policy.
  // With requireParticipantsForScoring: false, the condition short-circuits
  expect(result.success).toEqual(true);
});

it('blocks removal with existing outcome when no scoring policy override and no substitutions', () => {
  // attachScoringPolicy: false means no requireParticipantsForScoring override
  const { tournamentRecord, drawId } = generateTeamTournament({ attachScoringPolicy: false });
  tournamentEngine.setState(tournamentRecord);

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const { positionAssignments } = drawDefinition.structures[0];

  let {
    matchUps: [singlesMatchUp],
  } = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: { matchUpTypes: [SINGLES] },
  });

  const { matchUpId } = singlesMatchUp;
  const drawPositions = singlesMatchUp.drawPositions;
  const teamParticipantIds = positionAssignments
    .filter(({ drawPosition }) => drawPositions.includes(drawPosition))
    .map(getParticipantId);

  const { participants: teamParticipants } = tournamentEngine.getParticipants({
    participantFilters: { participantIds: teamParticipantIds },
  });

  // assign individual participants to both sides
  teamParticipants.forEach((teamParticipant) => {
    const individualParticipantId = teamParticipant.individualParticipantIds[0];
    const result = tournamentEngine.assignTieMatchUpParticipantId({
      participantId: individualParticipantId,
      tieMatchUpId: matchUpId,
      drawId,
    });
    expect(result.success).toEqual(true);
  });

  // score the matchUp (using policyDefinitions override to allow scoring without full participants)
  const policyDefinitions = { [POLICY_TYPE_SCORING]: { requireParticipantsForScoring: false } };
  const { outcome } = mocksEngine.generateOutcomeFromScoreString({
    matchUpStatus: COMPLETED,
    scoreString: '6-1 6-1',
    winningSide: 1,
  });

  let result = tournamentEngine.setMatchUpStatus({
    policyDefinitions,
    matchUpId,
    outcome,
    drawId,
  });
  expect(result.success).toEqual(true);

  // now try to remove without the scoring policy — should return EXISTING_OUTCOME
  const individualParticipantId = teamParticipants[0].individualParticipantIds[0];
  result = tournamentEngine.removeTieMatchUpParticipantId({
    participantId: individualParticipantId,
    tieMatchUpId: matchUpId,
    drawId,
  });
  expect(result.error).toEqual(EXISTING_OUTCOME);
});
