import { describe, expect, test } from 'vitest';

import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';

// constants
import { INDIVIDUAL, NOT_ON_TEAM_ROSTER, TEAM } from '@Constants/participantConstants';
import { SHARED_INDIVIDUAL_PARTICIPANT } from '@Constants/errorConditionConstants';
import { DOUBLES, SINGLES } from '@Constants/matchUpTypes';
import { COMPETITOR } from '@Constants/participantRoles';
import { TEAM_EVENT } from '@Constants/eventConstants';

/**
 * One player, one team, per event (CA 2026-10-29): a player who belongs to one team of an event, by its roster or
 * by a lineUp in any of the event's draws, may not appear in another team's lineUp in that event. A player who
 * belongs to no team may join a lineUp, and the result says so with a NOT_ON_TEAM_ROSTER warning. Event entries
 * may still overlap (they are a pool); every method that writes a lineUp enforces the rule.
 */
const tieFormat = {
  winCriteria: { valueGoal: 2 },
  collectionDefinitions: [
    { collectionId: 'sA', collectionName: 'Singles A', matchUpType: SINGLES, matchUpCount: 1, matchUpValue: 1 },
    { collectionId: 'sB', collectionName: 'Singles B', matchUpType: SINGLES, matchUpCount: 1, matchUpValue: 1 },
    { collectionId: 'd', collectionName: 'Doubles', matchUpType: DOUBLES, matchUpCount: 1, matchUpValue: 1 },
  ],
};

function setup(drawProfilesCount = 1) {
  const {
    drawIds,
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    eventProfiles: [
      {
        drawProfiles: Array.from({ length: drawProfilesCount }, () => ({ drawSize: 4, tieFormat })),
        eventType: TEAM_EVENT,
        tieFormat,
      },
    ],
    setState: true,
  });
  const teams = tournamentEngine.getParticipants({ participantFilters: { participantTypes: [TEAM] } }).participants;
  return { drawIds, eventId, teams };
}

function firstDual(drawId: string) {
  const dual = tournamentEngine.allDrawMatchUps({ drawId, inContext: true, matchUpFilters: { matchUpTypes: [TEAM] } })
    .matchUps[0];
  const singles = dual.tieMatchUps.find(({ matchUpType }) => matchUpType === SINGLES);
  return { dual, singles, sideTeamIds: dual.sides.map(({ participantId }) => participantId) };
}

function freeIndividual(): string {
  const participant = {
    person: { standardGivenName: 'Free', standardFamilyName: 'Agent' },
    participantRole: COMPETITOR,
    participantType: INDIVIDUAL,
  };
  return tournamentEngine.addParticipant({ participant, returnParticipant: true }).participant.participantId;
}

describe('one player, one team, per event', () => {
  test('assignTieMatchUpParticipantId: another team refused, no team warned, own roster plain', () => {
    const {
      drawIds: [drawId],
      teams,
    } = setup();
    const { singles, sideTeamIds } = firstDual(drawId);
    const side1Team = teams.find(({ participantId }) => participantId === sideTeamIds[0]);
    // a team of the event that is not in this dual
    const thirdTeam = teams.find(({ participantId }) => !sideTeamIds.includes(participantId));

    let result: any = tournamentEngine.assignTieMatchUpParticipantId({
      participantId: thirdTeam.individualParticipantIds[0],
      teamParticipantId: side1Team.participantId,
      tieMatchUpId: singles.matchUpId,
      drawId,
    });
    expect(result.error).toEqual(SHARED_INDIVIDUAL_PARTICIPANT);
    expect(result.context).toEqual({
      participantId: thirdTeam.individualParticipantIds[0],
      teamParticipantId: thirdTeam.participantId,
    });

    const freeId = freeIndividual();
    result = tournamentEngine.assignTieMatchUpParticipantId({
      teamParticipantId: side1Team.participantId,
      tieMatchUpId: singles.matchUpId,
      participantId: freeId,
      drawId,
    });
    expect(result.success).toEqual(true);
    expect(result.warnings).toEqual([{ code: NOT_ON_TEAM_ROSTER, info: { participantIds: [freeId] } }]);

    // once in side 1's lineUp, the free player belongs to that team: the other side cannot have them
    const { singles: refreshed } = firstDual(drawId);
    const otherSingles = firstDual(drawId).dual.tieMatchUps.filter(({ matchUpType }) => matchUpType === SINGLES)[1];
    result = tournamentEngine.assignTieMatchUpParticipantId({
      teamParticipantId: sideTeamIds[1],
      tieMatchUpId: otherSingles.matchUpId,
      participantId: freeId,
      drawId,
    });
    expect(result.error).toEqual(SHARED_INDIVIDUAL_PARTICIPANT);
    expect(refreshed.matchUpId).toEqual(singles.matchUpId);

    result = tournamentEngine.assignTieMatchUpParticipantId({
      participantId: side1Team.individualParticipantIds[0],
      teamParticipantId: side1Team.participantId,
      tieMatchUpId: otherSingles.matchUpId,
      drawId,
    });
    expect(result.success).toEqual(true);
    expect(result.warnings).toBeUndefined();
  });

  test('a lineUp in one draw makes the player that team’s in every draw of the event', () => {
    const { drawIds, teams } = setup(2);
    const freeId = freeIndividual();

    const first = firstDual(drawIds[0]);
    let result: any = tournamentEngine.assignTieMatchUpParticipantId({
      teamParticipantId: first.sideTeamIds[0],
      tieMatchUpId: first.singles.matchUpId,
      participantId: freeId,
      drawId: drawIds[0],
    });
    expect(result.success).toEqual(true);

    const second = firstDual(drawIds[1]);
    const otherTeamId = second.sideTeamIds.find((teamId) => teamId !== first.sideTeamIds[0]);
    result = tournamentEngine.assignTieMatchUpParticipantId({
      tieMatchUpId: second.singles.matchUpId,
      teamParticipantId: otherTeamId,
      participantId: freeId,
      drawId: drawIds[1],
    });
    expect(result.error).toEqual(SHARED_INDIVIDUAL_PARTICIPANT);
    expect(teams.length).toEqual(4);
  });

  test('replaceTieMatchUpParticipantId refuses another team’s player', () => {
    const {
      drawIds: [drawId],
      teams,
    } = setup();
    const { singles, sideTeamIds } = firstDual(drawId);
    const side1Team = teams.find(({ participantId }) => participantId === sideTeamIds[0]);
    const thirdTeam = teams.find(({ participantId }) => !sideTeamIds.includes(participantId));

    let result: any = tournamentEngine.assignTieMatchUpParticipantId({
      participantId: side1Team.individualParticipantIds[0],
      teamParticipantId: side1Team.participantId,
      tieMatchUpId: singles.matchUpId,
      drawId,
    });
    expect(result.success).toEqual(true);

    result = tournamentEngine.replaceTieMatchUpParticipantId({
      existingParticipantId: side1Team.individualParticipantIds[0],
      newParticipantId: thirdTeam.individualParticipantIds[0],
      tieMatchUpId: singles.matchUpId,
      drawId,
    });
    expect(result.error).toEqual(SHARED_INDIVIDUAL_PARTICIPANT);

    const freeId = freeIndividual();
    result = tournamentEngine.replaceTieMatchUpParticipantId({
      existingParticipantId: side1Team.individualParticipantIds[0],
      tieMatchUpId: singles.matchUpId,
      newParticipantId: freeId,
      drawId,
    });
    expect(result.success).toEqual(true);
    expect(result.warnings[0].code).toEqual(NOT_ON_TEAM_ROSTER);
  });

  test('applyLineUps and updateTeamLineUp refuse another team’s player', () => {
    const {
      drawIds: [drawId],
      teams,
    } = setup();
    const { dual, sideTeamIds } = firstDual(drawId);
    const side1Team = teams.find(({ participantId }) => participantId === sideTeamIds[0]);
    const thirdTeam = teams.find(({ participantId }) => !sideTeamIds.includes(participantId));

    const lineUp = [
      {
        participantId: side1Team.individualParticipantIds[0],
        collectionAssignments: [{ collectionId: 'sA', collectionPosition: 1 }],
      },
      {
        participantId: thirdTeam.individualParticipantIds[0],
        collectionAssignments: [{ collectionId: 'sB', collectionPosition: 1 }],
      },
    ];

    let result: any = tournamentEngine.applyLineUps({ matchUpId: dual.matchUpId, lineUps: [lineUp], drawId });
    expect(result.error).toEqual(SHARED_INDIVIDUAL_PARTICIPANT);

    result = tournamentEngine.updateTeamLineUp({ participantId: side1Team.participantId, tieFormat, lineUp, drawId });
    expect(result.error).toEqual(SHARED_INDIVIDUAL_PARTICIPANT);

    result = tournamentEngine.updateTeamLineUp({
      participantId: side1Team.participantId,
      tieFormat,
      lineUp: [lineUp[0]],
      drawId,
    });
    expect(result.success).toEqual(true);
  });

  test('generateLineUps leaves a shared player out, and oncePerMatchUpType uses a player in one singles', () => {
    const {
      drawIds: [drawId],
      eventId,
      teams,
    } = setup();
    const [teamA, teamB] = teams;
    const shared = teamA.individualParticipantIds[0];
    let result: any = tournamentEngine.modifyParticipant({
      participant: { ...teamB, individualParticipantIds: [...teamB.individualParticipantIds, shared] },
    });
    expect(result.success).toEqual(true);

    const lineUpIds = (lineUps, teamId) => (lineUps[teamId] ?? []).map(({ participantId }) => participantId);
    const inBothSingles = (lineUp) =>
      lineUp.filter(
        ({ collectionAssignments }) =>
          collectionAssignments.filter(({ collectionId }) => collectionId !== 'd').length > 1,
      ).length;

    result = tournamentEngine.generateLineUps({ drawId, eventId, scaleAccessor: {} });
    expect(result.success).toEqual(true);
    expect(lineUpIds(result.lineUps, teamA.participantId)).not.toContain(shared);
    expect(lineUpIds(result.lineUps, teamB.participantId)).not.toContain(shared);
    // the default still lets one player fill both singles collections
    expect(Object.values(result.lineUps).some((lineUp) => inBothSingles(lineUp) > 0)).toEqual(true);

    result = tournamentEngine.generateLineUps({ drawId, eventId, scaleAccessor: {}, oncePerMatchUpType: true });
    expect(Object.values(result.lineUps).every((lineUp) => inBothSingles(lineUp) === 0)).toEqual(true);
  });
});
