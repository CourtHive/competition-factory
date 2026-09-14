import { getContainedStructures } from '@Query/drawDefinition/getContainedStructures';
import { intersection, unique } from '@Tools/arrays';
import tournamentEngine from '@Engines/syncEngine';
import { constantToString } from '@Tools/strings';
import { xa } from '@Tools/extractAttributes';
import { mocksEngine } from '../../..';
import { expect, it } from 'vitest';

// constants
import { CONSOLATION, FEED_IN_CHAMPIONSHIP_TO_R16, MAIN, ROUND_ROBIN } from '@Constants/drawDefinitionConstants';
import { EXISTING_ROUND } from '@Constants/errorConditionConstants';
import { FEMALE, MALE } from '@Constants/genderConstants';
import { BYE } from '@Constants/matchUpStatusConstants';
import { PAIR } from '@Constants/participantConstants';
import { DOUBLES } from '@Constants/eventConstants';

it('can schedule potential rounds properly in scenarios with recovery times greater than average matchUp times', () => {
  const firstVenueId = 'firstVenueId';
  const venueProfiles = [{ venueId: firstVenueId, courtsCount: 31 }];
  const withPlayoffs = {
    roundProfiles: [{ 3: 1 }, { 4: 1 }],
    playoffAttributes: {
      '0-3': { name: 'Silver', abbreviation: 'S' },
      '0-4': { name: 'Gold', abbreviation: 'G' },
    },
  };
  const drawProfiles = [
    {
      drawType: FEED_IN_CHAMPIONSHIP_TO_R16,
      drawName: 'U16 Male Doubles',
      uniqueParticipants: true,
      participantsCount: 32,
      eventType: DOUBLES,
      idPrefix: 'M16',
      drawId: 'idM16',
      gender: MALE,
      drawSize: 32,
      withPlayoffs,
    },
    {
      drawType: FEED_IN_CHAMPIONSHIP_TO_R16,
      drawName: 'U16 Female Doubles',
      uniqueParticipants: true,
      participantsCount: 32,
      eventType: DOUBLES,
      idPrefix: 'F16',
      drawId: 'idF16',
      gender: FEMALE,
      drawSize: 32,
      withPlayoffs,
    },
    {
      drawType: FEED_IN_CHAMPIONSHIP_TO_R16,
      drawName: 'U18 Male Doubles',
      uniqueParticipants: true,
      participantsCount: 24,
      eventType: DOUBLES,
      idPrefix: 'M18',
      drawId: 'idM18',
      gender: MALE,
      drawSize: 32,
      withPlayoffs,
    },
  ];

  const startDate = '2022-01-01';

  const schedulingProfile = [
    {
      scheduleDate: startDate,
      venues: [
        {
          venueId: firstVenueId,
          rounds: [
            { drawId: 'idM16', winnerFinishingPositionRange: '1-16' },
            { drawId: 'idF16', winnerFinishingPositionRange: '1-16' },
            { drawId: 'idM18', winnerFinishingPositionRange: '1-16' },
            { drawId: 'idM16', winnerFinishingPositionRange: '9-24' },
            { drawId: 'idF16', winnerFinishingPositionRange: '9-24' },
            { drawId: 'idM18', winnerFinishingPositionRange: '9-24' },
            { drawId: 'idM16', winnerFinishingPositionRange: '1-8' },
            { drawId: 'idF16', winnerFinishingPositionRange: '1-8' },
            { drawId: 'idM18', winnerFinishingPositionRange: '1-8' },
          ],
        },
      ],
    },
  ];

  const {
    drawIds,
    scheduledRounds,
    tournamentRecord,
    venueIds: [venueId],
  } = mocksEngine.generateTournamentRecord({
    schedulingProfile,
    venueProfiles,
    drawProfiles,
    startDate,
  });

  expect(scheduledRounds.length).toEqual(9);
  expect(drawIds).toEqual(['idM16', 'idF16', 'idM18']);
  expect(venueId).toEqual(firstVenueId);

  tournamentEngine.setState(tournamentRecord);
  const { tournamentId } = tournamentRecord;

  let { schedulingProfile: attachedSchedulingProfile } = tournamentEngine.getSchedulingProfile();
  expect(attachedSchedulingProfile.length).toEqual(1);
  expect(attachedSchedulingProfile[0].venues[0].rounds.length).toEqual(9);

  const { participants } = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: [PAIR] },
  });

  expect(participants.length).toEqual(88); // expect (2 * 32 unique) + (24 unique) = 88

  const eventEnteredParticipantIds: string[] = [];
  const nonByeMatchUpsCount: number[] = [];
  const allMatchUpIds: string[] = [];

  // expect that 4 structures exist per drawDefinition, as follows:
  const expectations = {
    [constantToString(MAIN)]: 31,
    [constantToString(CONSOLATION)]: 23,
    Silver: 3,
    Gold: 1,
  };

  for (const drawId of drawIds) {
    const { drawDefinition, event } = tournamentEngine.getEvent({ drawId });
    expect(drawDefinition.structures.length).toEqual(4);

    const drawMatchUps: any[] = [];
    drawDefinition.structures.forEach((structure) => {
      const { matchUps, structureName } = structure;
      expect(matchUps.length).toEqual(expectations[structureName]);

      drawMatchUps.push(...matchUps);
    });

    const enteredParticipantIds = event.entries.map(({ participantId }) => participantId);
    eventEnteredParticipantIds.push(enteredParticipantIds);

    const matchUpIds = drawMatchUps.map(xa('matchUpId'));
    allMatchUpIds.push(...matchUpIds);

    const matchUpsNoBye = drawMatchUps.filter(({ matchUpStatus }) => matchUpStatus !== BYE);
    nonByeMatchUpsCount.push(matchUpsNoBye.length);
  }

  // the 3rd draw has 24/32 positions assigned to participants
  expect(nonByeMatchUpsCount).toEqual([58, 58, 42]);

  // since matchUpIds are generated using idPrefix for each drawProfile, ensure they are unique
  expect(unique(allMatchUpIds).length).toEqual(allMatchUpIds.length);

  // expect than none of the draws shares entered participantIds
  expect(intersection(eventEnteredParticipantIds[0], eventEnteredParticipantIds[1]).length).toEqual(0);

  expect(intersection(eventEnteredParticipantIds[0], eventEnteredParticipantIds[2]).length).toEqual(0);

  expect(intersection(eventEnteredParticipantIds[1], eventEnteredParticipantIds[2]).length).toEqual(0);

  const { matchUps } = tournamentEngine.allTournamentMatchUps();

  // this was coded prior to mocksEngine support and is retained to test EXISTING_ROUND error trapping
  const roundsToSchedule = ['1-16', '9-24', '1-8'];

  for (const drawId of drawIds) {
    const drawMatchUps = matchUps.filter((matchUp) => matchUp.drawId === drawId);

    for (const target of roundsToSchedule) {
      const range = target.indexOf('-') > 0 && target.split('-').map((x) => +x);
      const matchUp = drawMatchUps.find(({ finishingPositionRange }) => {
        return range ? intersection(range, finishingPositionRange.winner).length === 2 : undefined;
      });

      if (matchUp) {
        const { eventId, structureId, roundNumber } = matchUp;
        const result = tournamentEngine.addSchedulingProfileRound({
          round: { tournamentId, eventId, drawId, structureId, roundNumber },
          scheduleDate: startDate,
          venueId,
        });
        expect(result.error).toEqual(EXISTING_ROUND);
      }
    }
  }

  ({ schedulingProfile: attachedSchedulingProfile } = tournamentEngine.getSchedulingProfile());

  // should not schedule rounds which have already been scheduled
  expect(attachedSchedulingProfile[0].venues[0].rounds.length).toEqual(9);
});

it('mocksEngine can schedule Round Robin draws', () => {
  const firstVenueId = 'firstVenueId';
  const venueProfiles = [{ venueId: firstVenueId, courtsCount: 31 }];

  const drawId = 'RRtest';
  const drawProfiles = [{ drawId, drawType: ROUND_ROBIN, drawSize: 16 }];
  const startDate = '2022-01-01';
  const schedulingProfile = [
    {
      scheduleDate: startDate,
      venues: [
        {
          venueId: firstVenueId,
          rounds: [{ drawId: 'RRtest', roundNumber: 1 }],
        },
      ],
    },
  ];

  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    schedulingProfile,
    venueProfiles,
    drawProfiles,
    startDate,
  });
  tournamentEngine.setState(tournamentRecord);
  const containedStructureIds = getContainedStructures({
    tournamentRecord,
  }).containedStructures;

  const {
    matchUps: [{ structureId }],
  } = tournamentEngine.allTournamentMatchUps();

  const containerStructureId = Object.keys(containedStructureIds).find((containingStructureId) =>
    containedStructureIds[containingStructureId].includes(structureId),
  );
  expect(structureId).not.toBeUndefined();
  expect(containerStructureId).not.toBeUndefined();
  expect(structureId).not.toEqual(containerStructureId);

  const { schedulingProfile: attachedSchedulingProfile } = tournamentEngine.getSchedulingProfile();
  expect(attachedSchedulingProfile.length).toEqual(1);
  expect(attachedSchedulingProfile[0].venues[0].rounds.length).toEqual(1);
  const round = attachedSchedulingProfile[0].venues[0].rounds[0];
  expect(round.roundNumber).toEqual(1);
  expect(round.drawId).toEqual(drawId);
});
