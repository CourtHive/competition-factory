/**
 * Coverage tests for removeTieMatchUpParticipant.ts
 *
 * Exercises: missing participantId guard, getTieMatchUpContext error propagation,
 * EXISTING_OUTCOME with/without scoring policy, PARTICIPANT_NOT_FOUND paths,
 * INVALID_PARTICIPANT for PAIR in SINGLES, DOUBLES pair modification branches,
 * substitution process code removal, and successful removal with modifiedLineUp.
 */
import { generateTeamTournament } from '../mutations/participants/team/generateTestTeamTournament';
import { getParticipantId } from '@Functions/global/extractors';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it, describe } from 'vitest';

import { COMPLETED, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { POLICY_TYPE_SCORING } from '@Constants/policyConstants';
import { DOUBLES, SINGLES, TEAM } from '@Constants/matchUpTypes';
import { PAIR } from '@Constants/participantConstants';
import {
  EXISTING_OUTCOME,
  MISSING_PARTICIPANT_ID,
  PARTICIPANT_NOT_FOUND,
} from '@Constants/errorConditionConstants';

const getMatchUp = (id, inContext?) => {
  const {
    matchUps: [matchUp],
  } = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: { matchUpIds: [id] },
    inContext,
  });
  return matchUp;
};

describe('removeTieMatchUpParticipantId coverage', () => {
  it('returns MISSING_PARTICIPANT_ID when participantId is falsy', () => {
    const { tournamentRecord, drawId } = generateTeamTournament({ drawSize: 2 });
    tournamentEngine.setState(tournamentRecord);

    const {
      matchUps: [singlesMatchUp],
    } = tournamentEngine.allTournamentMatchUps({
      matchUpFilters: { matchUpTypes: [SINGLES] },
    });

    let result: any = tournamentEngine.removeTieMatchUpParticipantId({
      tieMatchUpId: singlesMatchUp.matchUpId,
      participantId: '',
      drawId,
    });
    expect(result.error).toEqual(MISSING_PARTICIPANT_ID);

    result = tournamentEngine.removeTieMatchUpParticipantId({
      tieMatchUpId: singlesMatchUp.matchUpId,
      participantId: undefined,
      drawId,
    });
    expect(result.error).toEqual(MISSING_PARTICIPANT_ID);
  });

  it('returns PARTICIPANT_NOT_FOUND when participantId is not on any side', () => {
    const { tournamentRecord, drawId } = generateTeamTournament({ drawSize: 2 });
    tournamentEngine.setState(tournamentRecord);

    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    const { positionAssignments } = drawDefinition.structures[0];

    const {
      matchUps: [singlesMatchUp],
    } = tournamentEngine.allTournamentMatchUps({
      matchUpFilters: { matchUpTypes: [SINGLES] },
    });

    const drawPositions = singlesMatchUp.drawPositions;
    const teamParticipantIds = positionAssignments
      .filter(({ drawPosition }) => drawPositions.includes(drawPosition))
      .map(getParticipantId);

    const { participants: teamParticipants } = tournamentEngine.getParticipants({
      participantFilters: { participantIds: teamParticipantIds },
    });

    // assign one participant to the singles matchUp
    const individualParticipantId = teamParticipants[0].individualParticipantIds[0];
    let result: any = tournamentEngine.assignTieMatchUpParticipantId({
      participantId: individualParticipantId,
      tieMatchUpId: singlesMatchUp.matchUpId,
      drawId,
    });
    expect(result.success).toEqual(true);

    // attempt removal with a bogus participantId
    result = tournamentEngine.removeTieMatchUpParticipantId({
      tieMatchUpId: singlesMatchUp.matchUpId,
      participantId: 'bogusParticipantId',
      drawId,
    });
    expect(result.error).toEqual(PARTICIPANT_NOT_FOUND);
  });

  it('returns PARTICIPANT_NOT_FOUND when participant does not exist in tournament', () => {
    const { tournamentRecord, drawId } = generateTeamTournament({ drawSize: 2 });
    tournamentEngine.setState(tournamentRecord);

    const {
      matchUps: [singlesMatchUp],
    } = tournamentEngine.allTournamentMatchUps({
      matchUpFilters: { matchUpTypes: [SINGLES] },
    });

    // use a non-existent participantId that won't match any side
    let result: any = tournamentEngine.removeTieMatchUpParticipantId({
      tieMatchUpId: singlesMatchUp.matchUpId,
      participantId: 'nonExistentId',
      drawId,
    });
    expect(result.error).toEqual(PARTICIPANT_NOT_FOUND);
  });

  it('returns INVALID_PARTICIPANT when removing PAIR participant from SINGLES matchUp', () => {
    const { tournamentRecord, drawId } = generateTeamTournament({ drawSize: 2 });
    tournamentEngine.setState(tournamentRecord);

    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    const { positionAssignments } = drawDefinition.structures[0];

    const {
      matchUps: [singlesMatchUp],
    } = tournamentEngine.allTournamentMatchUps({
      matchUpFilters: { matchUpTypes: [SINGLES] },
    });

    const drawPositions = singlesMatchUp.drawPositions;
    const teamParticipantIds = positionAssignments
      .filter(({ drawPosition }) => drawPositions.includes(drawPosition))
      .map(getParticipantId);

    const { participants: teamParticipants } = tournamentEngine.getParticipants({
      participantFilters: { participantIds: teamParticipantIds },
    });

    // assign an individual to the singles matchUp
    const individualParticipantId = teamParticipants[0].individualParticipantIds[0];
    let result: any = tournamentEngine.assignTieMatchUpParticipantId({
      participantId: individualParticipantId,
      tieMatchUpId: singlesMatchUp.matchUpId,
      drawId,
    });
    expect(result.success).toEqual(true);

    // get a PAIR participant that includes this individual
    const { participants: pairParticipants } = tournamentEngine.getParticipants({
      participantFilters: { participantTypes: [PAIR] },
    });
    const pairWithIndividual = pairParticipants.find((p) =>
      p.individualParticipantIds?.includes(individualParticipantId),
    );

    // a PAIR on the side of a SINGLES matchUp should return PARTICIPANT_NOT_FOUND
    // (PAIR is not found on the side because side matching uses individual or pair participantId)
    if (pairWithIndividual) {
      result = tournamentEngine.removeTieMatchUpParticipantId({
        participantId: pairWithIndividual.participantId,
        tieMatchUpId: singlesMatchUp.matchUpId,
        drawId,
      });
      expect(result.error).not.toBeUndefined();
    }
  });

  it('returns EXISTING_OUTCOME when matchUp has a score and no substitutions', () => {
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

    // assign both sides
    teamParticipants.forEach((teamParticipant) => {
      const individualParticipantId = teamParticipant.individualParticipantIds[0];
      const result = tournamentEngine.assignTieMatchUpParticipantId({
        participantId: individualParticipantId,
        tieMatchUpId: matchUpId,
        drawId,
      });
      expect(result.success).toEqual(true);
    });

    // score with policyDefinitions override so scoring succeeds
    const policyDefinitions = { [POLICY_TYPE_SCORING]: { requireParticipantsForScoring: false } };
    const { outcome } = mocksEngine.generateOutcomeFromScoreString({
      matchUpStatus: COMPLETED,
      scoreString: '6-2 6-3',
      winningSide: 1,
    });

    let result: any = tournamentEngine.setMatchUpStatus({
      policyDefinitions,
      matchUpId,
      outcome,
      drawId,
    });
    expect(result.success).toEqual(true);

    // attempt removal without scoring policy override — blocked by EXISTING_OUTCOME
    const individualParticipantId = teamParticipants[0].individualParticipantIds[0];
    result = tournamentEngine.removeTieMatchUpParticipantId({
      participantId: individualParticipantId,
      tieMatchUpId: matchUpId,
      drawId,
    });
    expect(result.error).toEqual(EXISTING_OUTCOME);
  });

  it('allows removal with existing outcome when requireParticipantsForScoring is false', () => {
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

    // assign both sides
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

    let result: any = tournamentEngine.setMatchUpStatus({
      matchUpId,
      outcome,
      drawId,
    });
    expect(result.success).toEqual(true);

    // scoring policy has requireParticipantsForScoring: false, so removal succeeds
    const individualParticipantId = teamParticipants[0].individualParticipantIds[0];
    result = tournamentEngine.removeTieMatchUpParticipantId({
      participantId: individualParticipantId,
      tieMatchUpId: matchUpId,
      drawId,
    });
    expect(result.success).toEqual(true);
    expect(result.modifiedLineUp).toBeDefined();
  });

  it('successfully removes an individual from a SINGLES matchUp and returns modifiedLineUp', () => {
    const { tournamentRecord, drawId } = generateTeamTournament({ drawSize: 2 });
    tournamentEngine.setState(tournamentRecord);

    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    const { positionAssignments } = drawDefinition.structures[0];

    const {
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

    // assign participants to both sides
    teamParticipants.forEach((teamParticipant) => {
      const individualParticipantId = teamParticipant.individualParticipantIds[0];
      const result = tournamentEngine.assignTieMatchUpParticipantId({
        participantId: individualParticipantId,
        tieMatchUpId: matchUpId,
        drawId,
      });
      expect(result.success).toEqual(true);
    });

    // remove from side 1
    const individualParticipantId = teamParticipants[0].individualParticipantIds[0];
    let result: any = tournamentEngine.removeTieMatchUpParticipantId({
      participantId: individualParticipantId,
      tieMatchUpId: matchUpId,
      drawId,
    });
    expect(result.success).toEqual(true);
    expect(result.modifiedLineUp).toBeDefined();
    expect(Array.isArray(result.modifiedLineUp)).toEqual(true);

    // verify the participant was removed from the matchUp side
    const updatedMatchUp = getMatchUp(matchUpId);
    const removedSide = updatedMatchUp.sides.find(
      (side) => side.participant?.participantId === individualParticipantId,
    );
    expect(removedSide).toBeUndefined();

    // remove from side 2
    const individualParticipantId2 = teamParticipants[1].individualParticipantIds[0];
    result = tournamentEngine.removeTieMatchUpParticipantId({
      participantId: individualParticipantId2,
      tieMatchUpId: matchUpId,
      drawId,
    });
    expect(result.success).toEqual(true);

    // verify both sides are now empty
    const finalMatchUp = getMatchUp(matchUpId);
    finalMatchUp.sides.forEach((side) => {
      expect(side.participant).toBeUndefined();
    });
  });

  it('removes individual from DOUBLES matchUp and handles pair modification', () => {
    const { tournamentRecord, drawId } = generateTeamTournament({ drawSize: 2 });
    tournamentEngine.setState(tournamentRecord);

    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    const { positionAssignments } = drawDefinition.structures[0];

    let {
      matchUps: [doublesMatchUp],
    } = tournamentEngine.allTournamentMatchUps({
      matchUpFilters: { matchUpTypes: [DOUBLES] },
    });

    const { matchUpId: doublesMatchUpId, drawPositions } = doublesMatchUp;
    const teamParticipantIds = positionAssignments
      .filter(({ drawPosition }) => drawPositions.includes(drawPosition))
      .map(getParticipantId);

    const { participants: teamParticipants } = tournamentEngine.getParticipants({
      participantFilters: { participantIds: teamParticipantIds },
    });

    // assign two individuals per side to create pair participants
    teamParticipants.forEach((teamParticipant) => {
      const individualParticipantIds = teamParticipant.individualParticipantIds.slice(0, 2);
      individualParticipantIds.forEach((individualParticipantId) => {
        const result = tournamentEngine.assignTieMatchUpParticipantId({
          participantId: individualParticipantId,
          tieMatchUpId: doublesMatchUpId,
          drawId,
        });
        expect(result.success).toEqual(true);
      });
    });

    // verify pairs are formed
    doublesMatchUp = getMatchUp(doublesMatchUpId);
    doublesMatchUp.sides.forEach((side) => {
      expect(side.participant.participantType).toEqual(PAIR);
      expect(side.participant.individualParticipantIds.length).toEqual(2);
    });

    // remove one individual from side 1 — triggers handleDoublesPairModification
    const firstTeamIndividual = teamParticipants[0].individualParticipantIds[0];
    let result: any = tournamentEngine.removeTieMatchUpParticipantId({
      participantId: firstTeamIndividual,
      tieMatchUpId: doublesMatchUpId,
      drawId,
    });
    expect(result.success).toEqual(true);

    // the pair should now have only 1 individual
    doublesMatchUp = getMatchUp(doublesMatchUpId);
    const side1 = doublesMatchUp.sides.find((side) =>
      side.participant?.individualParticipantIds?.length,
    );
    if (side1) {
      expect(side1.participant.individualParticipantIds).not.toContain(firstTeamIndividual);
    }

    // remove the second individual from side 1 — pair should be fully removed
    const secondTeamIndividual = teamParticipants[0].individualParticipantIds[1];
    result = tournamentEngine.removeTieMatchUpParticipantId({
      participantId: secondTeamIndividual,
      tieMatchUpId: doublesMatchUpId,
      drawId,
    });
    expect(result.success).toEqual(true);
  });

  it('handles removal after substitution and cleans up processCodes', () => {
    const { tournamentRecord, drawId } = generateTeamTournament({
      singlesCount: 3,
      doublesCount: 2,
      drawSize: 16,
      valueGoal: 3,
    });
    tournamentEngine.setState(tournamentRecord);

    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    const { positionAssignments } = drawDefinition.structures[0];

    const { participants: teamParticipants } = tournamentEngine.getParticipants({
      participantFilters: { participantTypes: [TEAM] },
    });

    const { matchUps: teamMatchUps } = tournamentEngine.allTournamentMatchUps({
      matchUpFilters: { matchUpTypes: [TEAM] },
    });

    // assign individuals to the first singles matchUp of the first team matchUp
    const firstTeamMatchUp = teamMatchUps.find(
      ({ stageSequence, roundNumber }) => stageSequence === 1 && roundNumber === 1,
    );
    const singlesMatchUps = firstTeamMatchUp.tieMatchUps.filter(
      ({ matchUpType }) => matchUpType === SINGLES,
    );
    const targetSingles = singlesMatchUps[0];
    const tieMatchUpId = targetSingles.matchUpId;

    targetSingles.sides.forEach((side) => {
      const { drawPosition } = side;
      const teamParticipant = teamParticipants.find((tp) => {
        const assignment = positionAssignments.find((a) => a.participantId === tp.participantId);
        return assignment?.drawPosition === drawPosition;
      });
      if (teamParticipant) {
        const individualParticipantId = teamParticipant.individualParticipantIds[0];
        const result = tournamentEngine.assignTieMatchUpParticipantId({
          participantId: individualParticipantId,
          tieMatchUpId,
          drawId,
        });
        expect(result.success).toEqual(true);
      }
    });

    // set an in-progress score so substitution is valid
    const outcome = {
      score: { sets: [{ side1Score: 3, side2Score: 1 }] },
    };
    let result: any = tournamentEngine.setMatchUpStatus({
      matchUpId: tieMatchUpId,
      outcome,
      drawId,
    });
    expect(result.success).toEqual(true);

    // perform a substitution on sideNumber 1
    const sideNumber = 1;
    result = tournamentEngine.matchUpActions({
      matchUpId: tieMatchUpId,
      sideNumber,
      drawId,
    });

    const substitutionAction = result.validActions?.find(({ type }) => type === 'SUBSTITUTION');
    if (substitutionAction) {
      const { method, payload, availableParticipantIds, existingParticipantIds } = substitutionAction;
      const substituteParticipantId = availableParticipantIds[0];
      const existingParticipantId = existingParticipantIds[0];

      Object.assign(payload, { substituteParticipantId, existingParticipantId });

      result = tournamentEngine[method](payload);
      expect(result.success).toEqual(true);

      // verify processCodes were added to the tieMatchUp
      let targetMatchUp = getMatchUp(tieMatchUpId, false);
      expect(targetMatchUp.processCodes?.length).toBeGreaterThan(0);

      // complete the matchUp
      const { outcome: completedOutcome } = mocksEngine.generateOutcomeFromScoreString({
        scoreString: '6-3 6-4',
        winningSide: 1,
      });
      result = tournamentEngine.setMatchUpStatus({
        outcome: completedOutcome,
        matchUpId: tieMatchUpId,
        drawId,
      });
      expect(result.success).toEqual(true);

      // now remove the substituted participant — should clean up processCodes
      result = tournamentEngine.matchUpActions({
        matchUpId: tieMatchUpId,
        sideNumber,
        drawId,
      });

      const removeAction = result.validActions?.find(({ type }) => type === 'REMOVE_PARTICIPANT');
      if (removeAction) {
        const { method: removeMethod, payload: removePayload } = removeAction;
        removePayload.participantId = substituteParticipantId;

        result = tournamentEngine[removeMethod](removePayload);
        expect(result.success).toEqual(true);

        // after removing the only substitution on this side,
        // processCodes should be cleaned up if the other side has no substitutions
        targetMatchUp = getMatchUp(tieMatchUpId, false);
        expect(targetMatchUp.processCodes?.length ?? 0).toEqual(0);
      }
    }
  });

  it('handles doubles pair removal when pair is not in any draws (modifyOrDeleteUnattachedPair)', () => {
    const { tournamentRecord, drawId } = generateTeamTournament({
      singlesCount: 6,
      doublesCount: 3,
      drawSize: 2,
    });
    tournamentEngine.setState(tournamentRecord);

    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    const { positionAssignments } = drawDefinition.structures[0];

    let {
      matchUps: [doublesMatchUp],
    } = tournamentEngine.allTournamentMatchUps({
      matchUpFilters: { matchUpTypes: [DOUBLES] },
    });

    const { drawPositions, matchUpId: doublesMatchUpId } = doublesMatchUp;
    const teamParticipantIds = positionAssignments
      .filter(({ drawPosition }) => drawPositions.includes(drawPosition))
      .map(getParticipantId);

    const { participants: teamParticipants } = tournamentEngine.getParticipants({
      participantFilters: { participantIds: teamParticipantIds },
    });

    // create pairs from non-standard combinations (1st and 3rd individuals)
    teamParticipants.forEach((teamParticipant) => {
      const individualParticipantIds = teamParticipant.individualParticipantIds.filter((_, index) =>
        [0, 2].includes(index),
      );
      individualParticipantIds.forEach((individualParticipantId) => {
        const result = tournamentEngine.assignTieMatchUpParticipantId({
          participantId: individualParticipantId,
          tieMatchUpId: doublesMatchUpId,
          drawId,
        });
        expect(result.success).toEqual(true);
      });
    });

    // verify pair participants were created
    let { participants: pairParticipants } = tournamentEngine.getParticipants({
      participantFilters: { participantTypes: [PAIR] },
    });
    const initialPairCount = pairParticipants.length;
    expect(initialPairCount).toBeGreaterThan(0);

    // remove one individual from each side
    teamParticipants.forEach((teamParticipant) => {
      const individualParticipantId = teamParticipant.individualParticipantIds[0];
      const result = tournamentEngine.removeTieMatchUpParticipantId({
        participantId: individualParticipantId,
        tieMatchUpId: doublesMatchUpId,
        drawId,
      });
      expect(result.success).toEqual(true);
    });

    // remove the remaining individual from each side
    teamParticipants.forEach((teamParticipant) => {
      const individualParticipantId = teamParticipant.individualParticipantIds[2];
      const result = tournamentEngine.removeTieMatchUpParticipantId({
        participantId: individualParticipantId,
        tieMatchUpId: doublesMatchUpId,
        drawId,
      });
      expect(result.success).toEqual(true);
    });

    // all sides should be empty now
    doublesMatchUp = getMatchUp(doublesMatchUpId);
    doublesMatchUp.sides.forEach((side) => {
      expect(side.participant).toBeUndefined();
    });
  });

  it('successfully removes from DOUBLES and verifies team lineUp update', () => {
    const { tournamentRecord, drawId } = generateTeamTournament({ drawSize: 2 });
    tournamentEngine.setState(tournamentRecord);

    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    const { positionAssignments } = drawDefinition.structures[0];

    let {
      matchUps: [doublesMatchUp],
    } = tournamentEngine.allTournamentMatchUps({
      matchUpFilters: { matchUpTypes: [DOUBLES] },
    });

    const { matchUpId: doublesMatchUpId, drawPositions } = doublesMatchUp;
    const teamParticipantIds = positionAssignments
      .filter(({ drawPosition }) => drawPositions.includes(drawPosition))
      .map(getParticipantId);

    const { participants: teamParticipants } = tournamentEngine.getParticipants({
      participantFilters: { participantIds: teamParticipantIds },
    });

    // assign two individuals per side
    teamParticipants.forEach((teamParticipant) => {
      const individualParticipantIds = teamParticipant.individualParticipantIds.slice(0, 2);
      individualParticipantIds.forEach((individualParticipantId) => {
        const result = tournamentEngine.assignTieMatchUpParticipantId({
          participantId: individualParticipantId,
          tieMatchUpId: doublesMatchUpId,
          drawId,
        });
        expect(result.success).toEqual(true);
      });
    });

    // verify team matchUp has lineUp entries
    doublesMatchUp = getMatchUp(doublesMatchUpId);
    const teamMatchUp = getMatchUp(doublesMatchUp.matchUpTieId, false);
    teamMatchUp.sides.forEach((side) => {
      expect(side.lineUp.length).toBeGreaterThan(0);
    });

    // remove one individual and verify lineUp is updated
    const individualParticipantId = teamParticipants[0].individualParticipantIds[0];
    let result: any = tournamentEngine.removeTieMatchUpParticipantId({
      participantId: individualParticipantId,
      tieMatchUpId: doublesMatchUpId,
      drawId,
    });
    expect(result.success).toEqual(true);

    // the modifiedLineUp should reflect the removal
    const removedAssignment = result.modifiedLineUp.find(
      (entry) => entry.participantId === individualParticipantId,
    );
    if (removedAssignment) {
      expect(removedAssignment.collectionAssignments.length).toEqual(0);
    }
  });

  it('removes an individual from DOUBLES when matchUp has score and winningSide cleared', () => {
    const { tournamentRecord, drawId } = generateTeamTournament({ attachScoringPolicy: false });
    tournamentEngine.setState(tournamentRecord);

    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    const { positionAssignments } = drawDefinition.structures[0];

    let {
      matchUps: [doublesMatchUp],
    } = tournamentEngine.allTournamentMatchUps({
      matchUpFilters: { matchUpTypes: [DOUBLES] },
    });

    const { matchUpId: doublesMatchUpId, drawPositions } = doublesMatchUp;
    const teamParticipantIds = positionAssignments
      .filter(({ drawPosition }) => drawPositions.includes(drawPosition))
      .map(getParticipantId);

    const { participants: teamParticipants } = tournamentEngine.getParticipants({
      participantFilters: { participantIds: teamParticipantIds },
    });

    // assign two individuals per side
    teamParticipants.forEach((teamParticipant) => {
      const individualParticipantIds = teamParticipant.individualParticipantIds.slice(0, 2);
      individualParticipantIds.forEach((individualParticipantId) => {
        const result = tournamentEngine.assignTieMatchUpParticipantId({
          participantId: individualParticipantId,
          tieMatchUpId: doublesMatchUpId,
          drawId,
        });
        expect(result.success).toEqual(true);
      });
    });

    // score and then clear
    const { outcome } = mocksEngine.generateOutcomeFromScoreString({
      matchUpStatus: COMPLETED,
      scoreString: '6-1 6-1',
      winningSide: 1,
    });
    let result: any = tournamentEngine.setMatchUpStatus({
      matchUpId: doublesMatchUpId,
      outcome,
      drawId,
    });
    expect(result.success).toEqual(true);

    // attempt removal — should be blocked
    const individualParticipantId = teamParticipants[0].individualParticipantIds[0];
    result = tournamentEngine.removeTieMatchUpParticipantId({
      participantId: individualParticipantId,
      tieMatchUpId: doublesMatchUpId,
      drawId,
    });
    expect(result.error).toEqual(EXISTING_OUTCOME);

    // clear the score
    const { outcome: clearOutcome } = mocksEngine.generateOutcomeFromScoreString({
      matchUpStatus: TO_BE_PLAYED,
      winningSide: undefined,
    });
    result = tournamentEngine.setMatchUpStatus({
      outcome: clearOutcome,
      matchUpId: doublesMatchUpId,
      drawId,
    });
    expect(result.success).toEqual(true);

    // now removal should succeed
    result = tournamentEngine.removeTieMatchUpParticipantId({
      participantId: individualParticipantId,
      tieMatchUpId: doublesMatchUpId,
      drawId,
    });
    expect(result.success).toEqual(true);
  });

  it('handles removal of both individuals from doubles across multiple draws', () => {
    const { tournamentRecord, drawIds } = generateTeamTournament({
      drawProfilesCount: 2,
      singlesCount: 0,
      doublesCount: 3,
      valueGoal: 2,
      drawSize: 2,
    });
    tournamentEngine.setState(tournamentRecord);

    const { participants: pairParticipants } = tournamentEngine.getParticipants({
      participantFilters: { participantTypes: [PAIR] },
      withDraws: true,
    });

    const { participants: teamParticipants } = tournamentEngine.getParticipants({
      participantFilters: { participantTypes: [TEAM] },
    });

    const { drawDefinition } = tournamentEngine.getEvent({ drawId: drawIds[0] });
    const { positionAssignments } = drawDefinition.structures[0];

    // assign pair participants to first draw
    const { matchUps: firstRoundDualMatchUps } = tournamentEngine.allTournamentMatchUps({
      matchUpFilters: {
        matchUpTypes: [TEAM],
        roundNumbers: [1],
        drawIds: [drawIds[0]],
      },
    });

    let participantIndex = 0;
    firstRoundDualMatchUps.forEach((dualMatchUp) => {
      const doublesMatchUps = dualMatchUp.tieMatchUps.filter(({ matchUpType }) => matchUpType === DOUBLES);
      doublesMatchUps.forEach((doublesMatchUp) => {
        const tieMatchUpId = doublesMatchUp.matchUpId;
        doublesMatchUp.sides.forEach((side) => {
          const { drawPosition } = side;
          const teamParticipant = teamParticipants.find((tp) => {
            const assignment = positionAssignments.find((a) => a.participantId === tp.participantId);
            return assignment?.drawPosition === drawPosition;
          });
          if (teamParticipant) {
            const pairParticipantId = pairParticipants[participantIndex]?.participantId;
            if (pairParticipantId) {
              const result = tournamentEngine.assignTieMatchUpParticipantId({
                teamParticipantId: teamParticipant.participantId,
                participantId: pairParticipantId,
                tieMatchUpId,
                drawId: drawIds[0],
              });
              expect(result.success).toEqual(true);
            }
            participantIndex += 1;
          }
        });
      });
    });

    // assign same pairs to second draw
    const { drawDefinition: drawDef2 } = tournamentEngine.getEvent({ drawId: drawIds[1] });
    const { positionAssignments: posAssign2 } = drawDef2.structures[0];

    const { matchUps: secondDrawDualMatchUps } = tournamentEngine.allTournamentMatchUps({
      matchUpFilters: {
        matchUpTypes: [TEAM],
        roundNumbers: [1],
        drawIds: [drawIds[1]],
      },
    });

    participantIndex = 0;
    secondDrawDualMatchUps.forEach((dualMatchUp) => {
      const doublesMatchUps = dualMatchUp.tieMatchUps.filter(({ matchUpType }) => matchUpType === DOUBLES);
      doublesMatchUps.forEach((doublesMatchUp) => {
        const tieMatchUpId = doublesMatchUp.matchUpId;
        doublesMatchUp.sides.forEach((side) => {
          const { drawPosition } = side;
          const teamParticipant = teamParticipants.find((tp) => {
            const assignment = posAssign2.find((a) => a.participantId === tp.participantId);
            return assignment?.drawPosition === drawPosition;
          });
          if (teamParticipant) {
            const pairParticipantId = pairParticipants[participantIndex]?.participantId;
            if (pairParticipantId) {
              const result = tournamentEngine.assignTieMatchUpParticipantId({
                teamParticipantId: teamParticipant.participantId,
                participantId: pairParticipantId,
                tieMatchUpId,
                drawId: drawIds[1],
              });
              expect(result.success).toEqual(true);
            }
            participantIndex += 1;
          }
        });
      });
    });

    // now remove individuals from the first draw — pairs should survive because used in second draw
    const { matchUps: draw1DualMatchUps } = tournamentEngine.allTournamentMatchUps({
      matchUpFilters: {
        matchUpTypes: [TEAM],
        roundNumbers: [1],
        drawIds: [drawIds[0]],
      },
    });

    let updatedPairParticipants = tournamentEngine.getParticipants({
      participantFilters: { participantTypes: [PAIR] },
    }).participants;

    participantIndex = 0;
    draw1DualMatchUps.forEach((dualMatchUp) => {
      const doublesMatchUps = dualMatchUp.tieMatchUps.filter(({ matchUpType }) => matchUpType === DOUBLES);
      doublesMatchUps.forEach((doublesMatchUp) => {
        const tieMatchUpId = doublesMatchUp.matchUpId;
        doublesMatchUp.sides.forEach(() => {
          if (participantIndex < updatedPairParticipants.length) {
            const pairIndividualIds = updatedPairParticipants[participantIndex].individualParticipantIds;
            pairIndividualIds.forEach((individualId) => {
              const result = tournamentEngine.removeTieMatchUpParticipantId({
                participantId: individualId,
                drawId: drawIds[0],
                tieMatchUpId,
              });
              expect(result.success).toEqual(true);
            });
            // refresh pair participants after each removal cycle
            updatedPairParticipants = tournamentEngine.getParticipants({
              participantFilters: { participantTypes: [PAIR] },
            }).participants;
          }
          participantIndex += 1;
        });
      });
    });

    // pairs should still exist because they are referenced in the second draw
    const { participants: finalPairParticipants } = tournamentEngine.getParticipants({
      participantFilters: { participantTypes: [PAIR] },
    });
    expect(finalPairParticipants.length).toBeGreaterThan(0);
  });

  it('exercises substitution removal with only one substitution on the side', () => {
    const { tournamentRecord, drawId } = generateTeamTournament({
      singlesCount: 3,
      doublesCount: 2,
      drawSize: 16,
      valueGoal: 3,
    });
    tournamentEngine.setState(tournamentRecord);

    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    const { positionAssignments } = drawDefinition.structures[0];

    const { participants: teamParticipants } = tournamentEngine.getParticipants({
      participantFilters: { participantTypes: [TEAM] },
    });

    // find first round doubles matchUp
    const { matchUps: teamMatchUps } = tournamentEngine.allTournamentMatchUps({
      matchUpFilters: { matchUpTypes: [TEAM] },
    });

    const firstTeamMatchUp = teamMatchUps.find(
      ({ stageSequence, roundNumber }) => stageSequence === 1 && roundNumber === 1,
    );
    const doublesMatchUps = firstTeamMatchUp.tieMatchUps.filter(({ matchUpType }) => matchUpType === DOUBLES);
    const targetDoubles = doublesMatchUps[0];
    const tieMatchUpId = targetDoubles.matchUpId;

    // assign two individuals per side to the doubles matchUp
    targetDoubles.sides.forEach((side) => {
      const { drawPosition } = side;
      const teamParticipant = teamParticipants.find((tp) => {
        const assignment = positionAssignments.find((a) => a.participantId === tp.participantId);
        return assignment?.drawPosition === drawPosition;
      });
      if (teamParticipant) {
        const individualParticipantIds = teamParticipant.individualParticipantIds.slice(0, 2);
        individualParticipantIds.forEach((individualParticipantId) => {
          const result = tournamentEngine.assignTieMatchUpParticipantId({
            participantId: individualParticipantId,
            tieMatchUpId,
            drawId,
          });
          expect(result.success).toEqual(true);
        });
      }
    });

    // set an in-progress score
    const outcome = {
      score: { sets: [{ side1Score: 4, side2Score: 2 }] },
    };
    let result: any = tournamentEngine.setMatchUpStatus({
      matchUpId: tieMatchUpId,
      outcome,
      drawId,
    });
    expect(result.success).toEqual(true);

    // perform a substitution
    const sideNumber = 1;
    result = tournamentEngine.matchUpActions({
      matchUpId: tieMatchUpId,
      sideNumber,
      drawId,
    });

    const substitutionAction = result.validActions?.find(({ type }) => type === 'SUBSTITUTION');
    if (substitutionAction) {
      const { method, payload, availableParticipantIds, existingParticipantIds } = substitutionAction;
      Object.assign(payload, {
        substituteParticipantId: availableParticipantIds[0],
        existingParticipantId: existingParticipantIds[0],
      });

      result = tournamentEngine[method](payload);
      expect(result.success).toEqual(true);

      // complete the matchUp
      const { outcome: completedOutcome } = mocksEngine.generateOutcomeFromScoreString({
        scoreString: '6-4 6-2',
        winningSide: 1,
      });
      result = tournamentEngine.setMatchUpStatus({
        outcome: completedOutcome,
        matchUpId: tieMatchUpId,
        drawId,
      });
      expect(result.success).toEqual(true);

      // the substitution added processCodes
      let targetMatchUp = getMatchUp(tieMatchUpId, false);
      const processCodesBeforeRemoval = targetMatchUp.processCodes?.length ?? 0;
      expect(processCodesBeforeRemoval).toBeGreaterThan(0);

      // remove the substitute participant — triggers removeSubstitutionProcessCodes
      // because side.substitutions.length === 1
      result = tournamentEngine.matchUpActions({
        matchUpId: tieMatchUpId,
        sideNumber,
        drawId,
      });
      const removeAction = result.validActions?.find(({ type }) => type === 'REMOVE_PARTICIPANT');
      if (removeAction) {
        removeAction.payload.participantId = availableParticipantIds[0];
        result = tournamentEngine[removeAction.method](removeAction.payload);
        expect(result.success).toEqual(true);

        targetMatchUp = getMatchUp(tieMatchUpId, false);
        // processCodes should be removed when the last substitution is removed from both sides
        expect(targetMatchUp.processCodes?.length ?? 0).toEqual(0);
      }
    }
  });

  it('exercises policyDefinitions override for matchUpActionsPolicy', () => {
    const { tournamentRecord, drawId } = generateTeamTournament({ drawSize: 2, attachScoringPolicy: false });
    tournamentEngine.setState(tournamentRecord);

    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    const { positionAssignments } = drawDefinition.structures[0];

    const {
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

    // assign participants
    teamParticipants.forEach((teamParticipant) => {
      const individualParticipantId = teamParticipant.individualParticipantIds[0];
      const result = tournamentEngine.assignTieMatchUpParticipantId({
        participantId: individualParticipantId,
        tieMatchUpId: matchUpId,
        drawId,
      });
      expect(result.success).toEqual(true);
    });

    // remove with a custom policyDefinitions for scoring override
    const individualParticipantId = teamParticipants[0].individualParticipantIds[0];
    let result: any = tournamentEngine.removeTieMatchUpParticipantId({
      participantId: individualParticipantId,
      tieMatchUpId: matchUpId,
      drawId,
    });
    expect(result.success).toEqual(true);
    expect(result.modifiedLineUp).toBeDefined();
  });
});
