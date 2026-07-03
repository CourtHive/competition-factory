import { generateTeamTournament } from './generateTestTeamTournament';
import { getParticipantId } from '@Functions/global/extractors';
import { firstClassOrExtension } from '@Acquire/firstClassOrExtension';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { intersection } from '@Tools/arrays';
import { expect, it } from 'vitest';

// constants
import { COMPLETED, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { INDIVIDUAL, PAIR } from '@Constants/participantConstants';
import { DOUBLES, TEAM } from '@Constants/matchUpTypes';
import { LINEUPS } from '@Constants/extensionConstants';
import {
  EXISTING_OUTCOME,
  INVALID_PARTICIPANT_TYPE,
  MISSING_PARTICIPANT_ID,
  PARTICIPANT_NOT_FOUND,
} from '@Constants/errorConditionConstants';

// reusable
const getDoublesMatchUp = (id, inContext?) => {
  const {
    matchUps: [foo],
  } = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: { matchUpIds: [id] },
    inContext,
  });
  return foo;
};

it('can both assign and remove individualParticipants in DOUBLES matchUps that are part of team events', () => {
  const { tournamentRecord, drawId } = generateTeamTournament({ drawSize: 2 });
  tournamentEngine.setState(tournamentRecord);

  // get the first doubles matchUp
  let {
    matchUps: [doublesMatchUp],
  } = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: { matchUpTypes: [DOUBLES] },
  });

  // get the matchUpId for the first doubles matchUp
  const { matchUpId: doublesMatchUpId } = doublesMatchUp;

  // confirm that matchUpFilters/matchUpIds can find tieMatchUps
  doublesMatchUp = getDoublesMatchUp(doublesMatchUpId);
  expect(doublesMatchUp.matchUpId).toEqual(doublesMatchUpId);
  expect(doublesMatchUp.matchUpType).toEqual(DOUBLES);

  // get positionAssignments to determine drawPositions
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const { positionAssignments } = drawDefinition.structures[0];

  // get the teamParticipantIds for each side in the matchUp
  const drawPositions = doublesMatchUp.drawPositions;
  const teamParticipantIds = positionAssignments
    .filter(({ drawPosition }) => drawPositions.includes(drawPosition))
    .map(getParticipantId);

  // get the teamParticipants for each side in the matchUp
  const { participants: teamParticipants } = tournamentEngine.getParticipants({
    participantFilters: { participantIds: teamParticipantIds },
  });

  // get the participantId for the first team
  const [firstParticipant] = teamParticipants;
  const firstParticipantId = firstParticipant.participantId;

  // utility function
  const getSide = (id) => {
    const drawPosition = positionAssignments.find((assignment) => assignment.participantId === id).drawPosition;
    return doublesMatchUp.sides.find((side) => side.drawPosition === drawPosition);
  };

  // get the side for the first team participant
  const firstParticipantSide = getSide(firstParticipantId);

  // assign the first team member of the first team participant to a doubles matchUp
  let result = tournamentEngine.assignTieMatchUpParticipantId({
    participantId: firstParticipant.individualParticipantIds[0],
    tieMatchUpId: doublesMatchUpId,
    drawId,
  });
  expect(result.success).toEqual(true);
  expect(result.modifiedLineUp[0].participantId).toEqual(firstParticipant.individualParticipantIds[0]);
  expect(result.modifiedLineUp[0].collectionAssignments[0].collectionId).toEqual(doublesMatchUp.collectionId);
  expect(result.modifiedLineUp[0].collectionAssignments[0].collectionPosition).toEqual(
    doublesMatchUp.collectionPosition,
  );

  doublesMatchUp = getDoublesMatchUp(doublesMatchUpId, false);
  expect(doublesMatchUp.sides).toEqual([{ sideNumber: 1 }, { sideNumber: 2 }]);

  doublesMatchUp = getDoublesMatchUp(doublesMatchUpId);
  const targetSide = doublesMatchUp.sides.find((side) => side.sideNumber === firstParticipantSide.sideNumber);
  expect(targetSide.participant).not.toBeUndefined();

  const individualParticipantId = targetSide.participant.individualParticipantIds[0];
  result = tournamentEngine.removeTieMatchUpParticipantId({
    participantId: individualParticipantId,
    tieMatchUpId: doublesMatchUpId,
    drawId,
  });
  expect(result.modifiedLineUp[0].collectionAssignments.length).toEqual(0);
  result = tournamentEngine.removeTieMatchUpParticipantId({
    participantId: individualParticipantId,
    tieMatchUpId: doublesMatchUpId,
    drawId,
  });
  expect(result.error).toEqual(PARTICIPANT_NOT_FOUND);
  result = tournamentEngine.removeTieMatchUpParticipantId({
    tieMatchUpId: doublesMatchUpId,
    drawId,
  });
  expect(result.error).toEqual(MISSING_PARTICIPANT_ID);
  result = tournamentEngine.removeTieMatchUpParticipantId({
    tieMatchUpId: doublesMatchUpId,
    participantId: 'bogusId',
    drawId,
  });
  expect(result.error).toEqual(PARTICIPANT_NOT_FOUND);
});

it('An EXISTING_OUTCOME will prevent removal of individualParticipants in DOUBLES matchUps that are part of team events', () => {
  const { tournamentRecord, drawId } = generateTeamTournament({ attachScoringPolicy: false });
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

  // assign individual participants to the first doubles matchUp
  teamParticipants.forEach((teamParticipant) => {
    const { participantId } = teamParticipant;
    const assignment = positionAssignments.find((assignment) => assignment.participantId === participantId);
    const side = doublesMatchUp.sides.find((side) => side.drawPosition === assignment.drawPosition);
    const { sideNumber } = side;

    const individualParticipantIds = teamParticipant.individualParticipantIds.slice(0, 2);

    individualParticipantIds.forEach((individualParticipantId, i) => {
      const result = tournamentEngine.assignTieMatchUpParticipantId({
        participantId: individualParticipantId,
        tieMatchUpId: doublesMatchUpId,
        drawId,
      });
      expect(result.success).toEqual(true);
      expect(result.modifiedLineUp[i].participantId).toEqual(individualParticipantId);
      expect(result.modifiedLineUp[i].collectionAssignments[0].collectionId).toEqual(doublesMatchUp.collectionId);
      expect(result.modifiedLineUp[i].collectionAssignments[0].collectionPosition).toEqual(
        doublesMatchUp.collectionPosition,
      );

      doublesMatchUp = getDoublesMatchUp(doublesMatchUpId);
      const matchUpSide = doublesMatchUp.sides.find((side) => side.sideNumber === sideNumber);
      expect(matchUpSide.participant.participantType).toEqual(PAIR);
      expect(matchUpSide.participant.individualParticipantIds.length).toEqual(i + 1);
    });
  });

  let {
    matchUps: [teamMatchUp],
  } = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: { matchUpIds: [doublesMatchUp.matchUpTieId] },
    inContext: false,
  });
  teamMatchUp.sides.forEach((side) => {
    expect(side.lineUp[0].collectionAssignments.length).toEqual(1);
    expect(side.lineUp[1].collectionAssignments.length).toEqual(1);
  });

  // score the DOUBLES matchUp
  let { outcome } = mocksEngine.generateOutcomeFromScoreString({
    scoreString: '6-1 6-1',
    winningSide: 1,
    matchUpStatus: COMPLETED,
  });
  let result = tournamentEngine.setMatchUpStatus({
    matchUpId: doublesMatchUpId,
    outcome,
    drawId,
  });
  expect(result.success).toEqual(true);

  doublesMatchUp = getDoublesMatchUp(doublesMatchUpId);
  expect(doublesMatchUp.winningSide).toEqual(outcome.winningSide);

  // attempt to remove participants from DOUBLES matchUp; expect error
  result = removeFirstParticipantFromBothSides();
  expect(result.error).toEqual(EXISTING_OUTCOME);

  // remove the result from DOUBLES matchUp
  ({ outcome } = mocksEngine.generateOutcomeFromScoreString({
    matchUpStatus: TO_BE_PLAYED,
    winningSide: undefined,
  }));
  result = tournamentEngine.setMatchUpStatus({
    matchUpId: doublesMatchUpId,
    outcome,
    drawId,
  });
  expect(result.success).toEqual(true);

  // attempt to remove participants from DOUBLES matchUp; expect success
  result = removeFirstParticipantFromBothSides();
  expect(result[0].success).toEqual(true);
  expect(result[1].success).toEqual(true);
  doublesMatchUp = getDoublesMatchUp(doublesMatchUpId);
  doublesMatchUp.sides.forEach((side) => {
    expect(side.participant.participantType).toEqual(PAIR);
    expect(side.participant.individualParticipantIds.length).toEqual(1);
  });

  let { participants: pairParticipants } = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: [PAIR] },
  });

  let individualParticipantIdsCount = pairParticipants
    .map(({ individualParticipantIds }) => individualParticipantIds?.length || 0)
    .sort();
  expect(individualParticipantIdsCount).toEqual([1, 1, 2, 2, 2, 2, 2, 2]);

  result = removeFirstParticipantFromBothSides();
  doublesMatchUp = getDoublesMatchUp(doublesMatchUpId);

  doublesMatchUp.sides.forEach((side) => expect(side.participant).toBeUndefined());

  ({
    matchUps: [teamMatchUp],
  } = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: { matchUpIds: [doublesMatchUp.matchUpTieId] },
    inContext: false,
  }));

  teamMatchUp.sides.forEach((side) => {
    expect(side.lineUp[0].collectionAssignments.length).toEqual(0);
    expect(side.lineUp[1].collectionAssignments.length).toEqual(0);
  });

  ({ participants: pairParticipants } = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: [PAIR] },
  }));

  individualParticipantIdsCount = pairParticipants
    .map(({ individualParticipantIds }) => individualParticipantIds?.length || 0)
    .sort();
  expect(individualParticipantIdsCount).toEqual([2, 2, 2, 2, 2, 2]);

  function removeFirstParticipantFromBothSides() {
    const results: any[] = [];
    // remove individual participants from each DOUBLES matchUp
    const success = teamParticipants.every((teamParticipant) => {
      const { participantId } = teamParticipant;
      const assignment = positionAssignments.find((assignment) => assignment.participantId === participantId);
      const side = doublesMatchUp.sides.find((side) => side.drawPosition === assignment.drawPosition);
      const individualParticipantId = side.participant.individualParticipantIds[0];
      result = tournamentEngine.removeTieMatchUpParticipantId({
        participantId: individualParticipantId,
        tieMatchUpId: doublesMatchUpId,
        drawId,
      });
      results.push(result);

      return !result?.error;
    });

    return success ? results : results[0];
  }
});

it('can create new PAIR participants and remove/replace individualParticipants', () => {
  const { tournamentRecord, drawId } = generateTeamTournament({
    drawSize: 2,
    singlesCount: 6,
    doublesCount: 3,
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

  // expect that there are initially six pair participants, 3 generated for each side
  let { participants: pairParticipants } = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: [PAIR] },
  });
  expect(pairParticipants.length).toEqual(6);

  const { participants: teamParticipants } = tournamentEngine.getParticipants({
    participantFilters: { participantIds: teamParticipantIds },
  });

  teamParticipants.forEach((teamParticipant) => {
    const { participantId } = teamParticipant;
    const assignment = positionAssignments.find((assignment) => assignment.participantId === participantId);
    const side = doublesMatchUp.sides.find((side) => side.drawPosition === assignment.drawPosition);
    const { sideNumber } = side;

    // create new pairs from the first and third individuals on each team
    const individualParticipantIds = teamParticipant.individualParticipantIds.filter((_, index) =>
      [1, 3].includes(index + 1),
    );

    individualParticipantIds.forEach((individualParticipantId, i) => {
      const result = tournamentEngine.assignTieMatchUpParticipantId({
        participantId: individualParticipantId,
        tieMatchUpId: doublesMatchUpId,
        drawId,
      });
      expect(result.success).toEqual(true);
      expect(result.modifiedLineUp[i].participantId).toEqual(individualParticipantId);
      expect(result.modifiedLineUp[i].collectionAssignments[0].collectionId).toEqual(doublesMatchUp.collectionId);
      expect(result.modifiedLineUp[i].collectionAssignments[0].collectionPosition).toEqual(
        doublesMatchUp.collectionPosition,
      );

      doublesMatchUp = getDoublesMatchUp(doublesMatchUpId);
      const matchUpSide = doublesMatchUp.sides.find((side) => side.sideNumber === sideNumber);
      expect(matchUpSide.participant.participantType).toEqual(PAIR);
      expect(matchUpSide.participant.individualParticipantIds.length).toEqual(i + 1);
    });
  });

  // confirm new doubles pairs have been created
  ({ participants: pairParticipants } = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: [PAIR] },
  }));
  expect(pairParticipants.length).toEqual(8);

  teamParticipants.forEach((teamParticipant) => {
    // get the third and fifth individual from each team
    const individualParticipantIds = teamParticipant.individualParticipantIds.filter((_, index) =>
      [3, 5].includes(index + 1),
    );
    const [existingParticipantId, newParticipantId] = individualParticipantIds;

    const result = tournamentEngine.replaceTieMatchUpParticipantId({
      tieMatchUpId: doublesMatchUpId,
      existingParticipantId,
      newParticipantId,
      drawId,
    });
    expect(result.success).toEqual(true);
  });

  // test for error conditions

  // attempt to replace an INDIVIDUAL with a PAIR participant; expect error.
  const pairParticipantId = pairParticipants[0].participantId;
  let result = teamParticipants.every((teamParticipant) => {
    // get the third and fifth individual from each team
    const individualParticipantIds = teamParticipant.individualParticipantIds.filter((_, index) =>
      [5].includes(index + 1),
    );
    const [existingParticipantId] = individualParticipantIds;
    const newParticipantId = pairParticipantId;

    let result = tournamentEngine.replaceTieMatchUpParticipantId({
      tieMatchUpId: doublesMatchUpId,
      existingParticipantId,
      newParticipantId,
      drawId,
    });
    expect(result.error).toEqual(INVALID_PARTICIPANT_TYPE);

    result = tournamentEngine.replaceTieMatchUpParticipantId({
      tieMatchUpId: doublesMatchUpId,
      existingParticipantId: 'bogusId',
      newParticipantId,
      drawId,
    });
    expect(result.error).toEqual(PARTICIPANT_NOT_FOUND);
    return result.success;
  });
  expect(result).toEqual(false);

  result = tournamentEngine.replaceTieMatchUpParticipantId({
    tieMatchUpId: doublesMatchUpId,
    drawId,
  });
  expect(result.error).toEqual(MISSING_PARTICIPANT_ID);
});

it('can assign PAIR participants to tieMatchUps', () => {
  const scenario = {
    drawSize: 4,
    singlesCount: 0,
    doublesCount: 3,
    valueGoal: 2,
  };

  const result = generateTeamTournament(scenario);
  const { tournamentRecord, drawId, valueGoal } = result;
  expect(valueGoal).toEqual(scenario.valueGoal);

  tournamentEngine.setState(tournamentRecord);

  const { matchUps: firstRoundDualMatchUps } = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: { matchUpTypes: [TEAM], roundNumbers: [1] },
  });

  const { participants: pairParticipants } = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: [PAIR] },
  });

  const { participants: teamParticipants } = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: [TEAM] },
  });

  // get positionAssignments to determine drawPositions
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const { positionAssignments } = drawDefinition.structures[0];

  let participantIndex = 0;
  // for each first round dualMatchUp assign individualParticipants to doubles matchUps
  firstRoundDualMatchUps.forEach((dualMatchUp) => {
    const doublesMatchUps = dualMatchUp.tieMatchUps.filter(({ matchUpType }) => matchUpType === DOUBLES);
    doublesMatchUps.forEach((doublesMatchUp, m) => {
      const tieMatchUpId = doublesMatchUp.matchUpId;
      doublesMatchUp.sides.forEach((side) => {
        const { drawPosition } = side;
        const teamParticipant = teamParticipants.find((teamParticipant) => {
          const { participantId } = teamParticipant;
          const assignment = positionAssignments.find((assignment) => assignment.participantId === participantId);
          return assignment.drawPosition === drawPosition;
        });

        const pairParticipantId = pairParticipants[participantIndex].participantId;

        const result = tournamentEngine.assignTieMatchUpParticipantId({
          teamParticipantId: teamParticipant.participantId,
          participantId: pairParticipantId,
          tieMatchUpId,
          drawId,
        });
        expect(result.success).toEqual(true);
        expect(result.modifiedLineUp.length).toEqual(2 * (m + 1));
        participantIndex += 1;
      });
    });
  });
});

it('handles pair dependencies across draws', () => {
  const scenario = {
    drawProfilesCount: 2,
    singlesCount: 0,
    doublesCount: 3,
    valueGoal: 2,
    drawSize: 2,
  };

  const result = generateTeamTournament(scenario);
  const { tournamentRecord, drawIds, eventId, valueGoal } = result;
  expect(valueGoal).toEqual(scenario.valueGoal);

  tournamentEngine.setState(tournamentRecord);

  let {
    event: { drawDefinitions },
  } = tournamentEngine.getEvent({ eventId });

  expect(drawDefinitions.length).toEqual(2);

  const drawEntries = drawDefinitions.map(({ entries }) => entries.map(({ participantId }) => participantId));
  expect(intersection(drawEntries[0], drawEntries[1]).length).toEqual(2);

  const { participants: individualParticipants } = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: [INDIVIDUAL] },
    withIndividualParticipants: true,
    withEvents: true,
    withDraws: true,
  });

  individualParticipants.forEach((individualParticipant) => expect(individualParticipant.draws.length).toEqual(2));

  let { participants: pairParticipants } = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: [PAIR] },
    withDraws: true,
  });

  expect(pairParticipants.length).toEqual(6);
  pairParticipants.forEach((pairParticipant) =>
    // no individuals have lineUp assignments
    expect(pairParticipant.draws.length).toEqual(0),
  );

  const { participants: teamParticipants } = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: [TEAM] },
  });

  // get positionAssignments to determine drawPositions
  const { drawDefinition } = tournamentEngine.getEvent({ drawId: drawIds[0] });
  const { positionAssignments } = drawDefinition.structures[0];

  assignPairParticipants({ drawId: drawIds[0] });

  ({ participants: pairParticipants } = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: [PAIR] },
    withDraws: true,
  }));

  // expect no new pairs were created and each pairParticipant is in both draws
  expect(pairParticipants.length).toEqual(6);
  pairParticipants.forEach((pairParticipant) => {
    expect(pairParticipant.draws.length).toEqual(1);
  });

  // assign the same pairs to matchUps in the second draw
  assignPairParticipants({ drawId: drawIds[1] });

  // --------------------------------------------------------
  // In this scenario the lineUps for each team are composed of participants from both teams
  // ... in other words, there is no equivalence between
  //     - teamParticipant.individualParticipantIds
  //     - teamLineUp.map(p => participantId)
  ({
    event: { drawDefinitions },
  } = tournamentEngine.getEvent({ eventId }));

  const lineUps = firstClassOrExtension({ element: drawDefinitions[0], attribute: 'lineUps', name: LINEUPS });
  const lineUpMap = Object.assign(
    {},
    ...Object.keys(lineUps).map((pid) => ({
      [pid]: lineUps[pid].map((l) => l.participantId),
    })),
  );
  const teamsMap = Object.assign(
    {},
    ...teamParticipants.map((t) => ({
      [t.participantId]: t.individualParticipantIds,
    })),
  );

  // because there is no equivalence the intersection.length is not equal to either lineUpMap or teamMap
  Object.keys(lineUpMap).forEach((teamParticipantId) => {
    const shared = intersection(lineUpMap[teamParticipantId], teamsMap[teamParticipantId]);
    expect(shared.length).not.toEqual(lineUpMap[teamParticipantId]);
    expect(shared.length).not.toEqual(teamsMap[teamParticipantId]);
  });

  // --------------------------------------------------------
  // remove the pair participants from the first draw
  removePairParticipants({ drawId: drawIds[0] });

  // expect that the pair participants have not been destroyed
  // in the process of breaking apart the pair participants
  ({ participants: pairParticipants } = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: [PAIR] },
  }));

  expect(pairParticipants.length).toEqual(6);

  function removePairParticipants({ drawId }) {
    const { matchUps: firstRoundDualMatchUps } = tournamentEngine.allTournamentMatchUps({
      matchUpFilters: {
        matchUpTypes: [TEAM],
        roundNumbers: [1],
        drawIds: [drawId], // since there are two draws must filter by drawId
      },
    });

    let participantIndex = 0;
    // now remove both individual participants from each DOUBLES matchUp
    firstRoundDualMatchUps.forEach((dualMatchUp) => {
      const doublesMatchUps = dualMatchUp.tieMatchUps.filter(({ matchUpType }) => matchUpType === DOUBLES);
      doublesMatchUps.forEach((doublesMatchUp) => {
        const tieMatchUpId = doublesMatchUp.matchUpId;
        doublesMatchUp.sides.forEach(() => {
          const individualParticipantIds = pairParticipants[participantIndex].individualParticipantIds;

          individualParticipantIds.forEach((participantId, i) => {
            const result = tournamentEngine.removeTieMatchUpParticipantId({
              participantId,
              tieMatchUpId,
              drawId,
            });
            expect(result.success).toEqual(true);

            // when the first individualParticipantId is removed and the pair can't be destroyed
            // a new PAIR participant is created with only one individualParticipant
            if (i === 0) {
              ({ participants: pairParticipants } = tournamentEngine.getParticipants({
                participantFilters: { participantTypes: [PAIR] },
              }));

              // so the number of pairParticipants is temporarily 7
              expect(pairParticipants.length).toEqual(7);
            }
          });
          participantIndex += 1;
        });
      });
    });
  }

  function assignPairParticipants({ drawId }) {
    const { matchUps: firstRoundDualMatchUps } = tournamentEngine.allTournamentMatchUps({
      matchUpFilters: {
        matchUpTypes: [TEAM],
        roundNumbers: [1],
        drawIds: [drawId], // since there are two draws must filter by drawId
      },
    });

    let participantIndex = 0;
    // for each first round dualMatchUp assign individualParticipants to doubles matchUps
    firstRoundDualMatchUps.forEach((dualMatchUp) => {
      const doublesMatchUps = dualMatchUp.tieMatchUps.filter(({ matchUpType }) => matchUpType === DOUBLES);
      doublesMatchUps.forEach((doublesMatchUp, m) => {
        const tieMatchUpId = doublesMatchUp.matchUpId;
        doublesMatchUp.sides.forEach((side) => {
          const { drawPosition } = side;
          const teamParticipant = teamParticipants.find((teamParticipant) => {
            const { participantId } = teamParticipant;
            const assignment = positionAssignments.find((assignment) => assignment.participantId === participantId);
            return assignment.drawPosition === drawPosition;
          });

          const pairParticipantId = pairParticipants[participantIndex].participantId;

          const result = tournamentEngine.assignTieMatchUpParticipantId({
            teamParticipantId: teamParticipant.participantId,
            participantId: pairParticipantId,
            tieMatchUpId,
            drawId,
          });
          expect(result.success).toEqual(true);
          expect(result.modifiedLineUp.length).toEqual(2 * (m + 1));
          participantIndex += 1;
        });
      });
    });
  }
});
