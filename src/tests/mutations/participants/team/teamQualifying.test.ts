import { getParticipantId } from '@Functions/global/extractors';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { instanceCount } from '@Tools/arrays';
import { UUID } from '@Tools/UUID';
import { expect, it } from 'vitest';

// Constants, Types and Fixtures
import { ALTERNATE, DIRECT_ACCEPTANCE } from '@Constants/entryStatusConstants';
import { DOUBLES_MATCHUP, SINGLES_MATCHUP } from '@Constants/matchUpTypes';
import { FORMAT_STANDARD } from '@Fixtures/scoring/matchUpFormats';
import { QUALIFYING } from '@Constants/drawDefinitionConstants';
import { TEAM_EVENT } from '@Constants/eventConstants';

it('Modifying tieFormats supported for TEAM QUALIFYING events', () => {
  const singlesCollectionId = UUID();
  const doublesCollectionId = UUID();
  const valueGoal = 4;
  const tieFormat = {
    winCriteria: { valueGoal },
    collectionDefinitions: [
      {
        collectionId: doublesCollectionId,
        collectionName: 'Doubles',
        matchUpType: DOUBLES_MATCHUP,
        matchUpCount: 2,
        matchUpFormat: 'SET3-S:6/TB7-F:TB10',
        matchUpValue: 1,
      },
      {
        collectionId: singlesCollectionId,
        collectionName: 'Singles',
        matchUpType: SINGLES_MATCHUP,
        matchUpCount: 5,
        matchUpFormat: FORMAT_STANDARD,
        matchUpValue: 1,
      },
    ],
  };

  const drawSize = 16;
  const eventProfiles = [
    {
      eventType: TEAM_EVENT,
      eventName: 'Test Team Event',
      tieFormat,
      drawProfiles: [
        {
          drawSize,
          tieFormat,
          drawName: 'Main Draw',
        },
      ],
    },
  ];

  const {
    eventIds: [eventId],
    drawIds,
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    eventProfiles,
  });

  // -----------------------------------------------------------------------------------
  // mocksEngine attaches tieFormat to event; remove it here to simulate other use cases
  delete tournamentRecord.events[0].tieFormat;
  // -----------------------------------------------------------------------------------

  tournamentEngine.setState(tournamentRecord);

  // -----------------------------------------------------------------------------------
  // mocksEngine was used to generate the TEAMs and entries for the event
  // generated drawDefinition is being delted so the API can be exercised directly
  let result = tournamentEngine.deleteDrawDefinitions({ drawIds });
  expect(result.success).toEqual(true);
  // -----------------------------------------------------------------------------------

  const { event } = tournamentEngine.getEvent({ eventId });
  expect(event.tieFormat).toBeUndefined();

  const qualifyingParticipantIds = event.entries.slice(8).map(getParticipantId);
  const alternateParticipantIds = event.entries.slice(6, 8).map(getParticipantId);

  result = tournamentEngine.modifyEntriesStatus({
    participantIds: qualifyingParticipantIds,
    entryStatus: DIRECT_ACCEPTANCE,
    entryStage: QUALIFYING,
    eventId,
  });
  expect(result.success).toEqual(true);

  result = tournamentEngine.modifyEntriesStatus({
    participantIds: alternateParticipantIds,
    entryStatus: ALTERNATE,
    eventId,
  });
  expect(result.success).toEqual(true);

  const entryDetails = instanceCount(
    tournamentEngine
      .getEvent({ eventId })
      .event.entries.map(({ entryStage, entryStatus }) => `${entryStage}|${entryStatus}`),
  );
  expect(entryDetails).toEqual({
    'MAIN|DIRECT_ACCEPTANCE': 6,
    'MAIN|ALTERNATE': 2,
    'QUALIFYING|DIRECT_ACCEPTANCE': 8,
  });

  const { drawDefinition } = tournamentEngine.generateDrawDefinition({
    qualifyingProfiles: [
      {
        structureProfiles: [
          {
            qualifyingPositions: 2,
            drawSize: 8,
          },
        ],
      },
    ],
    qualifyingOnly: true,
    eventId,
  });

  const drawId = drawDefinition.drawId;
  expect(drawDefinition.tieFormat).not.toBeUndefined();
  drawDefinition.structures.forEach((structure) => {
    if (structure.stage === QUALIFYING) {
      expect(structure.tieFormat).not.toBeUndefined();
    } else {
      expect(structure.tieFormat).toBeUndefined();
    }
  });

  const qualifyingStructure = drawDefinition.structures.find(({ stage }) => stage === QUALIFYING);

  result = tournamentEngine.addDrawDefinition({ eventId, drawDefinition });
  expect(result.success).toEqual(true);

  let matchUps = tournamentEngine.allTournamentMatchUps({
    contextFilters: { stages: [QUALIFYING] },
  }).matchUps;

  expect(matchUps.length).toEqual(60);

  const thirdCollectionId = UUID();
  tournamentEngine.addCollectionDefinition({
    collectionDefinition: {
      collectionName: 'Test',
      collectionOrder: 3,
      matchUpType: 'SINGLES',
      collectionId: thirdCollectionId,
      matchUpFormat: 'SET1-S:4/TB7',
      matchUpCount: 3,
      matchUpValue: 1,
    },
    structureId: qualifyingStructure.structureId,
    tieFormatName: 'Updated tieFormat',
    updateInProgressMatchUps: false,
    uuids: [],
    drawId,
  });

  matchUps = tournamentEngine.allTournamentMatchUps({
    contextFilters: { stages: [QUALIFYING] },
  }).matchUps;

  // 3 new tieMatchUps for each of 6 TEAM matchUps
  expect(matchUps.length).toEqual(60 + 18);

  result = tournamentEngine.generateDrawDefinition({
    drawSize: 8,
    drawId,
  });
  expect(result.success).toEqual(true);

  // qualifying matchUps should NOT have been modified
  matchUps = tournamentEngine.allTournamentMatchUps({
    contextFilters: { stages: [QUALIFYING] },
  }).matchUps;

  expect(matchUps.length).toEqual(60 + 18);
});
