import { describe, expect, test } from 'vitest';

import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';

// constants
import { EXISTING_PARTICIPANT } from '@Constants/errorConditionConstants';
import { DOUBLES, SINGLES, TEAM } from '@Constants/matchUpTypes';
import { INDIVIDUAL } from '@Constants/participantConstants';
import { COMPETITOR } from '@Constants/participantRoles';
import { TEAM_EVENT } from '@Constants/eventConstants';

/**
 * Assignment fills a free seat (NOC-723, CA 2026-11-06). A SINGLES seat the line shows held by another player, or a
 * DOUBLES seat whose pair is full, is refused with EXISTING_PARTICIPANT; changing who holds a seat is
 * replaceTieMatchUpParticipantId (or a substitution). It is the rule matchUpActions applies when it offers ASSIGN.
 * Before, the SINGLES call succeeded and left two holders in the lineUp while the line still showed the first, and
 * a third DOUBLES player silently broke up the pair.
 */
const tieFormat = {
  winCriteria: { valueGoal: 2 },
  collectionDefinitions: [
    { collectionId: 's', collectionName: 'Singles', matchUpType: SINGLES, matchUpCount: 2, matchUpValue: 1 },
    { collectionId: 'd', collectionName: 'Doubles', matchUpType: DOUBLES, matchUpCount: 1, matchUpValue: 1 },
  ],
};

function setup() {
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    eventProfiles: [{ drawProfiles: [{ drawSize: 4, tieFormat }], eventType: TEAM_EVENT, tieFormat }],
    setState: true,
  });
  const dual = tournamentEngine.allDrawMatchUps({ drawId, inContext: true, matchUpFilters: { matchUpTypes: [TEAM] } })
    .matchUps[0];
  const team = tournamentEngine.getParticipants({
    participantFilters: { participantIds: [dual.sides[0].participantId] },
  }).participants[0];
  const [singles1, singles2] = dual.tieMatchUps.filter(({ matchUpType }) => matchUpType === SINGLES);
  const doubles = dual.tieMatchUps.find(({ matchUpType }) => matchUpType === DOUBLES);
  return { drawId, dual, members: team.individualParticipantIds, singles1, singles2, doubles };
}

function freeIndividual(): string {
  const participant = {
    person: { standardGivenName: 'Free', standardFamilyName: 'Agent' },
    participantRole: COMPETITOR,
    participantType: INDIVIDUAL,
  };
  return tournamentEngine.addParticipant({ participant, returnParticipant: true }).participant.participantId;
}

function shownOnSide1(drawId: string, matchUpId: string): string[] {
  const participant = tournamentEngine
    .findMatchUp({ drawId, matchUpId, inContext: true })
    .matchUp.sides.find(({ sideNumber }) => sideNumber === 1)?.participant;
  return participant?.individualParticipantIds ?? (participant?.participantId ? [participant.participantId] : []);
}

function lineUpHolders(drawId: string, dualMatchUpId: string, collectionId: string, collectionPosition: number) {
  const dual = tournamentEngine.findMatchUp({ drawId, matchUpId: dualMatchUpId }).matchUp;
  return (dual.sides.find(({ sideNumber }) => sideNumber === 1)?.lineUp ?? [])
    .filter(({ collectionAssignments }) =>
      collectionAssignments?.some(
        (assignment) =>
          assignment.collectionId === collectionId &&
          assignment.collectionPosition === collectionPosition &&
          !assignment.previousParticipantId,
      ),
    )
    .map(({ participantId }) => participantId);
}

describe('assignTieMatchUpParticipantId fills a free seat', () => {
  test('a SINGLES seat held by another player is refused, and nothing changes', () => {
    const { drawId, dual, members, singles1 } = setup();
    const [a, b] = members;

    let result: any = tournamentEngine.assignTieMatchUpParticipantId({
      drawId,
      tieMatchUpId: singles1.matchUpId,
      participantId: a,
    });
    expect(result.success).toEqual(true);

    result = tournamentEngine.assignTieMatchUpParticipantId({
      drawId,
      tieMatchUpId: singles1.matchUpId,
      participantId: b,
    });
    expect(result.error).toEqual(EXISTING_PARTICIPANT);
    expect(result.context).toMatchObject({
      participantIds: [a],
      collectionId: 's',
      collectionPosition: 1,
      sideNumber: 1,
    });

    expect(shownOnSide1(drawId, singles1.matchUpId)).toEqual([a]);
    expect(lineUpHolders(drawId, dual.matchUpId, 's', 1)).toEqual([a]);
  });

  test('assigning the holder again is still a success', () => {
    const { drawId, members, singles1 } = setup();
    const [a] = members;

    let result: any = tournamentEngine.assignTieMatchUpParticipantId({
      drawId,
      tieMatchUpId: singles1.matchUpId,
      participantId: a,
    });
    expect(result.success).toEqual(true);
    result = tournamentEngine.assignTieMatchUpParticipantId({
      drawId,
      tieMatchUpId: singles1.matchUpId,
      participantId: a,
    });
    expect(result.success).toEqual(true);
    expect(shownOnSide1(drawId, singles1.matchUpId)).toEqual([a]);
  });

  test('a player moves into a free SINGLES seat', () => {
    const { drawId, members, singles1, singles2 } = setup();
    const [a, b] = members;

    let result: any = tournamentEngine.assignTieMatchUpParticipantId({
      drawId,
      tieMatchUpId: singles1.matchUpId,
      participantId: a,
    });
    expect(result.success).toEqual(true);
    result = tournamentEngine.assignTieMatchUpParticipantId({
      drawId,
      tieMatchUpId: singles2.matchUpId,
      participantId: b,
    });
    expect(result.success).toEqual(true);
    expect(shownOnSide1(drawId, singles2.matchUpId)).toEqual([b]);
  });

  test('replaceTieMatchUpParticipantId changes the holder of a SINGLES seat', () => {
    const { drawId, dual, members, singles1 } = setup();
    const [a, b] = members;

    let result: any = tournamentEngine.assignTieMatchUpParticipantId({
      drawId,
      tieMatchUpId: singles1.matchUpId,
      participantId: a,
    });
    expect(result.success).toEqual(true);
    result = tournamentEngine.replaceTieMatchUpParticipantId({
      tieMatchUpId: singles1.matchUpId,
      existingParticipantId: a,
      newParticipantId: b,
      drawId,
    });
    expect(result.success).toEqual(true);
    expect(shownOnSide1(drawId, singles1.matchUpId)).toEqual([b]);
    expect(lineUpHolders(drawId, dual.matchUpId, 's', 1)).toEqual([b]);
  });

  test('a DOUBLES seat takes a partner, and a full pair is refused intact', () => {
    const { drawId, dual, members, doubles } = setup();
    const [a, b] = members;
    const c = freeIndividual();

    let result: any = tournamentEngine.assignTieMatchUpParticipantId({
      drawId,
      tieMatchUpId: doubles.matchUpId,
      participantId: a,
    });
    expect(result.success).toEqual(true);
    result = tournamentEngine.assignTieMatchUpParticipantId({
      drawId,
      tieMatchUpId: doubles.matchUpId,
      participantId: b,
    });
    expect(result.success).toEqual(true);
    expect(shownOnSide1(drawId, doubles.matchUpId).sort()).toEqual([a, b].sort());

    result = tournamentEngine.assignTieMatchUpParticipantId({
      teamParticipantId: dual.sides[0].participantId,
      tieMatchUpId: doubles.matchUpId,
      participantId: c,
      drawId,
    });
    expect(result.error).toEqual(EXISTING_PARTICIPANT);
    expect(result.context.participantIds.sort()).toEqual([a, b].sort());
    expect(shownOnSide1(drawId, doubles.matchUpId).sort()).toEqual([a, b].sort());
  });
});
