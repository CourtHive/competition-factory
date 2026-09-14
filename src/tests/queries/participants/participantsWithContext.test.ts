import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { intersection } from '@Tools/arrays';
import { expect, it } from 'vitest';

// constants
import { DOUBLES, SINGLES } from '@Constants/matchUpTypes';
import { PAIR } from '@Constants/participantConstants';
import { MALE } from '@Constants/genderConstants';
import { AGE } from '@Constants/eventConstants';

it('can add statistics to tournament participants', () => {
  const participantsProfile = {
    participantsCount: 200,
    participantType: PAIR,
    sex: MALE,
  };
  const drawProfiles = [
    {
      drawSize: 32,
      eventType: DOUBLES,
      participantsCount: 30,
      category: {
        ageCategoryCode: 'U18',
        categoryName: 'U18',
        type: AGE,
      },
      outcomes: [
        {
          roundNumber: 1,
          roundPosition: 2,
          scoreString: '6-1 6-2',
          winningSide: 1,
        },
        {
          roundNumber: 2,
          roundPosition: 1,
          scoreString: '6-2 6-1',
          winningSide: 1,
        },
        {
          roundNumber: 1,
          roundPosition: 3,
          scoreString: '6-1 6-3',
          winningSide: 1,
        },
        {
          roundNumber: 1,
          roundPosition: 4,
          scoreString: '6-1 6-4',
          winningSide: 1,
        },
        {
          roundNumber: 2,
          roundPosition: 2,
          scoreString: '6-2 6-2',
          winningSide: 1, // participant who won this match won 2 matches in this draw
        },
      ],
    },
    {
      drawSize: 32,
      eventType: SINGLES,
      participantsCount: 30,
      category: {
        ageCategoryCode: 'U18',
        categoryName: 'U18',
        type: AGE,
      },
      outcomes: [
        {
          roundNumber: 1,
          roundPosition: 2,
          scoreString: '6-1 6-2',
          winningSide: 1,
        },
        {
          roundNumber: 2,
          roundPosition: 1,
          scoreString: '6-2 6-1',
          winningSide: 1,
        },
        {
          roundNumber: 1,
          roundPosition: 3,
          scoreString: '6-1 6-3',
          winningSide: 1,
        },
        {
          roundNumber: 1,
          roundPosition: 4,
          scoreString: '6-1 6-4',
          winningSide: 1,
        },
        {
          roundNumber: 2,
          roundPosition: 2,
          scoreString: '6-2 6-2',
          winningSide: 1, // participant who won this match won 2 matches in this draw
        },
      ],
    },
  ];
  const genResult = mocksEngine.generateTournamentRecord({
    participantsProfile,
    drawProfiles,
  });

  let tournamentRecord = genResult.tournamentRecord;
  const eventIds = genResult.eventIds;

  tournamentEngine.setState(tournamentRecord);

  let extension: any = {
    name: 'ustaSection',
    value: { code: 65 },
  };
  tournamentEngine.addTournamentExtension({ extension });
  extension = {
    name: 'ustaDistrict',
    value: { code: 17 },
  };
  tournamentEngine.addTournamentExtension({ extension });
  extension = {
    name: 'ustaDivision',
    value: { code: 'X(50,60,70-80)d,SE' },
  };
  tournamentEngine.addTournamentExtension({ extension });

  ({ tournamentRecord } = tournamentEngine.getTournament({
    convertExtensions: true,
  }));
  expect(tournamentRecord._ustaSection.code).toEqual(65);
  expect(tournamentRecord._ustaDistrict.code).toEqual(17);
  expect(tournamentRecord._ustaDivision.code).toEqual('X(50,60,70-80)d,SE');

  const eventId = eventIds[0];
  const { event } = tournamentEngine.getEvent({ eventId });
  extension = {
    name: 'ustaLevel',
    value: 1,
  };
  tournamentEngine.addEventExtension({ eventId, extension });

  extension = {
    name: 'ustaDivision',
    value: { id: '123' },
  };
  tournamentEngine.addEventExtension({ eventId, extension });

  const positionAssignments = event.drawDefinitions[0].structures[0].positionAssignments;

  const { participants, derivedEventInfo } = tournamentEngine.getParticipants({
    withPotentialMatchUps: true,
    convertExtensions: true,
    withStatistics: true,
    withOpponents: true,
    withMatchUps: true,
    withEvents: true,
    withDraws: true,
  });
  // specified 200 participantType: DOUBLES => 200 PAIR + 400 INDIVIDUAL
  // specified category on bot DOUBLES (30 + 30 + 30) and SINGLES (30) + 120
  expect(participants.length).toEqual(720);

  const categoriesPresent = participants.every((participant) =>
    participant.events.every(({ eventId }) => derivedEventInfo[eventId].category),
  );
  expect(categoriesPresent).toBeTruthy();

  const doublesParticipant = getParticipant({
    tournamentParticipants: participants,
    positionAssignments,
    drawPosition: 1,
  });
  expect(doublesParticipant.statistics[0].statValue).toEqual(1);
  expect(doublesParticipant.opponents.length).toEqual(2);
  expect(doublesParticipant.matchUps.length).toEqual(3);
  expect(doublesParticipant.events.length).toEqual(1);
  expect(doublesParticipant.draws.length).toEqual(1);

  const individualParticipantId = doublesParticipant.individualParticipantIds[0];
  const individualParticipant = participants.find(
    (participant) => participant.participantId === individualParticipantId,
  );
  expect(individualParticipant.draws.length).toBeGreaterThan(0);
  expect(individualParticipant.statistics[0].statValue).toBeGreaterThan(0);

  expect(derivedEventInfo[individualParticipant.events[0].eventId].eventType).toEqual(DOUBLES);

  const hasPotentials = participants.find((p) => p.potentialMatchUps?.length);
  expect(hasPotentials).not.toBeUndefined();
});

it('can add statistics to tournament participants', () => {
  const drawProfiles = [
    {
      drawSize: 4,
      eventType: DOUBLES,
      participantsCount: 4,
      category: {
        ageCategoryCode: 'U18',
        categoryName: 'U18',
        type: AGE,
      },
    },
  ];
  const genResult = mocksEngine.generateTournamentRecord({
    drawProfiles,
  });
  const tournamentRecord = genResult.tournamentRecord;
  const eventIds = genResult.eventIds;
  tournamentEngine.setState(tournamentRecord);

  const eventId = eventIds[0];
  const { event } = tournamentEngine.getEvent({ eventId });

  const positionAssignments = event.drawDefinitions[0].structures[0].positionAssignments;

  const { participants } = tournamentEngine.getParticipants({
    withIndividualParticipants: true,
    convertExtensions: true,
    withStatistics: true,
    withOpponents: true,
    withMatchUps: true,
    withEvents: true,
  });
  expect(participants.length).toEqual(12);

  const doublesParticipant = getParticipant({
    tournamentParticipants: participants,
    positionAssignments,
    drawPosition: 1,
  });

  const { individualParticipantIds } = doublesParticipant;

  const individualParticipantId = doublesParticipant.individualParticipantIds[0];
  const individualParticipant = participants.find(
    (participant) => participant.participantId === individualParticipantId,
  );

  const {
    events: [{ partnerParticipantIds }],
  } = individualParticipant;

  // check that the individual and partner equal individualParticipantIds for the PAIR
  expect(intersection([individualParticipantId, ...partnerParticipantIds], individualParticipantIds).length).toEqual(2);
});

function getParticipant({ tournamentParticipants, positionAssignments, drawPosition }) {
  const participantId = positionAssignments.find(
    (assignment) => assignment.drawPosition === drawPosition,
  ).participantId;
  return tournamentParticipants.find((participant) => participant.participantId === participantId);
}
