import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { AD_HOC } from '@Constants/drawDefinitionConstants';
import { SINGLES_EVENT } from '@Constants/eventConstants';

it('can publish only specific rounds of AD_HOC structures', () => {
  const {
    tournamentRecord,
    eventIds: [eventId],
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        eventType: SINGLES_EVENT,
        drawType: AD_HOC,
        automated: true,
        roundsCount: 3,
        drawSize: 20,
      },
    ],
    participantsProfile: { idPrefix: 'P' },
  });

  tournamentEngine.setState(tournamentRecord);

  const { matchUps } = tournamentEngine.allTournamentMatchUps();
  expect(matchUps.length).toEqual(30);

  let result = tournamentEngine.publishEvent({
    returnEventData: true,
    eventId,
  });
  expect(result.success).toEqual(true);
  expect(Object.keys(result.eventData.drawsData[0].structures[0].roundMatchUps)).toEqual(['1', '2', '3']);

  const structureId = result.eventData.drawsData[0].structures[0].structureId;

  result = tournamentEngine.publishEvent({
    removePriorValues: true,
    returnEventData: true,
    drawDetails: {
      [drawId]: {
        structureDetails: { [structureId]: { roundLimit: 1, published: true } },
      },
    },
    eventId,
  });
  expect(result.success).toEqual(true);
  expect(Object.keys(result.eventData.drawsData[0].structures[0].roundMatchUps)).toEqual(['1']);

  result = tournamentEngine.publishEvent({
    removePriorValues: true,
    returnEventData: true,
    drawDetails: {
      [drawId]: {
        structureDetails: { [structureId]: { roundLimit: 2, published: true } },
      },
    },
    eventId,
  });
  expect(result.success).toEqual(true);
  expect(Object.keys(result.eventData.drawsData[0].structures[0].roundMatchUps)).toEqual(['1', '2']);

  expect(
    result.eventData.eventInfo.publishState.status.drawDetails[drawId].structureDetails[structureId].roundLimit,
  ).toEqual(2);

  result = tournamentEngine.publishEvent({
    removePriorValues: true,
    returnEventData: true,
    drawDetails: {
      [drawId]: {
        structureDetails: { [structureId]: { published: true } },
      },
    },
    eventId,
  });
  expect(result.success).toEqual(true);
  expect(Object.keys(result.eventData.drawsData[0].structures[0].roundMatchUps)).toEqual(['1', '2', '3']);
});
