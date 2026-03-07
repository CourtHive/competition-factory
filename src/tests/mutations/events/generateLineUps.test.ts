import { getParticipantId } from '@Functions/global/extractors';
import { instanceCount, unique } from '@Tools/arrays';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { DOMINANT_DUO_MIXED, USTA_GOLD_TEAM_CHALLENGE } from '@Constants/tieFormatConstants';
import { INDIVIDUAL, PAIR, TEAM_PARTICIPANT } from '@Constants/participantConstants';
import { INVALID_VALUES, SCORES_PRESENT } from '@Constants/errorConditionConstants';
import { POLICY_TYPE_SCORING } from '@Constants/policyConstants';
import { LINEUPS } from '@Constants/extensionConstants';
import { TEAM_EVENT } from '@Constants/eventConstants';
import { RANKING } from '@Constants/scaleConstants';
import { ASC } from '@Constants/sortingConstants';
import { LineUp } from '@Types/factoryTypes';

const policyDefinitions = { [POLICY_TYPE_SCORING]: { requireParticipantsForScoring: false } };

it('can generate lineUps for TEAM events', () => {
  const categoryName = '18U';
  const participantsProfile = {
    category: { categoryName },
    scaleAllParticipants: true,
  };
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    tournamentName: 'Dominant Duo',
    participantsProfile,
    drawProfiles: [
      {
        category: { ageCategoryCode: categoryName },
        tieFormatName: DOMINANT_DUO_MIXED,
        eventType: TEAM_EVENT,
        drawSize: 8,
      },
    ],
  });

  let result = tournamentEngine.setState(tournamentRecord);
  expect(result.success).toEqual(true);

  const { participants } = tournamentEngine.getParticipants({
    withIndividualParticipants: true,
    withScaleValues: true,
    withDraws: true,
  });

  // expect that all individual participants should be scaled
  const individualParticipants = participants.filter((participant) => participant.participantType === INDIVIDUAL);
  expect(individualParticipants.every((p) => p.rankings?.SINGLES.length)).toEqual(true);

  const teamParticipants = participants.filter(
    (participant) => participant.participantType === TEAM_PARTICIPANT && participant.draws?.[0]?.drawId === drawId,
  );
  // expect that DOMINANT_DUO_MIXED produces mixed sex teams
  teamParticipants.forEach((p) =>
    expect(p.individualParticipants.map((ip) => ip.person.sex)).toEqual(['FEMALE', 'MALE']),
  );

  result = tournamentEngine.generateLineUps({
    singlesOnly: true,
    drawId,
  });
  expect(result.error).toEqual(INVALID_VALUES);

  result = tournamentEngine.generateLineUps({
    useDefaultEventRanking: true,
    drawId,
  });
  expect(result.success).toEqual(true);
  expect(result.participantsToAdd.length).toEqual(8);

  const scaleAccessor = {
    scaleName: categoryName,
    scaleType: RANKING,
    sortOrder: ASC,
  };
  const lineUpResult: { [key: string]: LineUp } = tournamentEngine.generateLineUps({
    singlesOnly: true,
    scaleAccessor,
    drawId,
  }).lineUps;

  Object.values(lineUpResult).forEach((lineUp: LineUp) => {
    // each lineUp should consist of two participants
    expect(lineUp.length).toEqual(2);
    lineUp.forEach((participant) => {
      // each member of the DOMINANT_DUO should have two assignments
      expect(participant.collectionAssignments?.length).toEqual(2);
    });
  });
});

it('will assign TEAM positions based on ranking', () => {
  const categoryName = '18U';
  const participantsProfile = {
    category: { categoryName },
    scaleAllParticipants: true,
  };
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    tournamentName: 'Gold Team Challenge',
    participantsProfile,
    setState: true,
    drawProfiles: [
      {
        category: { ageCategoryCode: categoryName },
        tieFormatName: USTA_GOLD_TEAM_CHALLENGE,
        eventType: TEAM_EVENT,
        drawSize: 8,
      },
    ],
  });

  const { participants } = tournamentEngine.getParticipants({
    withIndividualParticipants: true,
    withScaleValues: true,
    withDraws: true,
  });

  // expect that all individual participants should be scaled
  const individualParticipants = participants.filter((participant) => participant.participantType === INDIVIDUAL);
  expect(individualParticipants.every((p) => p.rankings?.SINGLES.length)).toEqual(true);

  const teamParticipants = participants.filter(
    (participant) => participant.participantType === TEAM_PARTICIPANT && participant.draws?.[0]?.drawId === drawId,
  );

  // expect that USTA_GOLD_TEAM_CHALLENGE produces mixed sex teams
  teamParticipants.forEach((p) =>
    expect(p.individualParticipants && instanceCount(p.individualParticipants.map((ip) => ip.person.sex))).toEqual({
      FEMALE: 4,
      MALE: 4,
    }),
  );

  const { event } = tournamentEngine.getEvent({ drawId });
  const collectionIds = event.tieFormat.collectionDefinitions.map(({ collectionId }) => collectionId);

  const scaleAccessor = {
    scaleName: categoryName,
    scaleType: RANKING,
    sortOrder: ASC,
  };
  const lineUpResult: { [key: string]: LineUp } = tournamentEngine.generateLineUps({
    singlesOnly: true,
    scaleAccessor,
    drawId,
  }).lineUps;

  Object.values(lineUpResult).forEach((lineUp: LineUp) => {
    // each lineUp should consist of two participants
    expect(lineUp.length).toEqual(8);

    const collectionParticipantIds = {};
    const collectionDefinitions = {};

    lineUp.forEach((participant) => {
      participant.collectionAssignments?.forEach((assignment) => {
        const { collectionId, collectionPosition } = assignment;
        if (!collectionDefinitions[collectionId]) {
          collectionDefinitions[collectionId] = [];
        }
        if (!collectionParticipantIds[participant.participantId])
          collectionParticipantIds[participant.participantId] = [];
        collectionParticipantIds[participant.participantId].push(collectionId);
        collectionDefinitions[collectionId].push(collectionPosition);
      });
      // each member of the USTA_GOLD_TEAM_CHALLENGE should have three assignments
      // SINGLES, same-sex DOUBLES and MIXED DOUBLES
      expect(participant.collectionAssignments?.length).toEqual(3);
    });
    expect(Object.values(collectionDefinitions).map((c) => c)).toEqual([
      [1, 2, 3, 4], // MALE SINGLES
      [1, 1, 2, 2], // MALE DOUBLES
      [1, 2, 3, 4, 1, 2, 3, 4], // MIXED DOUBLES
      [1, 2, 3, 4], // FEMALE SINGLES
      [1, 1, 2, 2], // FEMALE DOUBLES
    ]);

    // each participant is in 3 collections
    const everyParticipantIn3 = Object.values(collectionParticipantIds).every((cids: any) =>
      cids.every((cid) => collectionIds.includes(cid)),
    );
    expect(everyParticipantIn3).toEqual(true);
    expect(unique(Object.values(collectionParticipantIds).map((v: any) => v.length))).toEqual([3]);
  });
});

it('can generate lineUps for TEAM events', () => {
  const categoryName = '18U';
  const participantsProfile = {
    category: { categoryName },
    scaleAllParticipants: true,
  };
  const {
    eventIds: [eventId],
    drawIds,
  } = mocksEngine.generateTournamentRecord({
    completeAllMatchUps: true,
    participantsProfile,
    policyDefinitions,
    setState: true,
    drawProfiles: [
      {
        category: { ageCategoryCode: categoryName },
        tieFormatName: USTA_GOLD_TEAM_CHALLENGE,
        eventType: TEAM_EVENT,
        drawSize: 8,
      },
    ],
  });

  const { matchUps } = tournamentEngine.allTournamentMatchUps();
  // all matchUps cannot be complelted if all participants have not been assigned propertly
  expect(matchUps.every((m) => m.winningSide)).toEqual(true);

  let pairParticipants = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: [PAIR] },
  }).participants;
  expect(pairParticipants.length).toEqual(64);
  const pairParticipantIds = pairParticipants.map(getParticipantId);

  // !!!!!!!!!!!!!!!!!!!!!!!!! DELETE DRAW_DEFINITION !!!!!!!!!!!!!!!!!!!!!!!!!!
  // Now delete the draw and all of the existing pairParticipants
  let result = tournamentEngine.deleteDrawDefinitions({ drawIds });
  expect(result.error).toEqual(SCORES_PRESENT);

  result = tournamentEngine.deleteDrawDefinitions({ drawIds, force: true });
  expect(result.success).toEqual(true);

  const { event } = tournamentEngine.getEvent({ eventId });
  // the previous tieFormat should still be attached to the event
  expect(event.tieFormat.tieFormatName).toEqual('USTA Gold Team Challenge');

  result = tournamentEngine.deleteParticipants({
    participantIds: pairParticipantIds,
  });
  expect(result.success).toEqual(true);

  pairParticipants = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: [PAIR] },
  }).participants;
  expect(pairParticipants.length).toEqual(0);

  result = tournamentEngine.generateDrawDefinition({
    drawSize: 8,
    eventId,
  });
  expect(result.success).toEqual(true);

  const drawDefinition = result.drawDefinition;

  // all of the TEAM matchUps should have 16 tieMatchUps
  expect(drawDefinition.structures[0].matchUps.every(({ tieMatchUps }) => tieMatchUps.length === 16)).toEqual(true);

  result = tournamentEngine.addDrawDefinition({
    drawDefinition,
    eventId,
  });

  expect(result.success).toEqual(true);

  // drawDefinition and structures/matchUps have been generated, but there are no PAIR participants
  pairParticipants = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: [PAIR] },
  }).participants;
  expect(pairParticipants.length).toEqual(0);

  const scaleAccessor = {
    scaleName: categoryName,
    scaleType: RANKING,
    sortOrder: ASC,
  };
  result = tournamentEngine.generateLineUps({
    drawId: drawDefinition.drawId,
    singlesOnly: true,
    scaleAccessor,
  });

  const { lineUps, participantsToAdd } = result;
  tournamentEngine.addParticipants({ participants: participantsToAdd });
  const extension = { name: LINEUPS, value: lineUps };
  tournamentEngine.addExtension({ element: drawDefinition, extension });

  pairParticipants = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: [PAIR] },
  }).participants;
  expect(pairParticipants.length).toEqual(64);
}, 0);
