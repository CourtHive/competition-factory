import { setSubscriptions } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { unique } from '@Tools/arrays';
import { expect, it } from 'vitest';

// constants
import { DRAW_ID_EXISTS, INVALID_DRAW_SIZE } from '@Constants/errorConditionConstants';
import { ADD_MATCHUPS, DELETED_MATCHUP_IDS } from '@Constants/topicConstants';
import { INDIVIDUAL, PAIR, TEAM } from '@Constants/participantConstants';

import { DOMINANT_DUO } from '@Constants/tieFormatConstants';
import { TEAM_EVENT } from '@Constants/eventConstants';
import {
  COMPASS,
  CURTIS,
  DRAW,
  FEED_IN_CHAMPIONSHIP,
  MAIN,
  QUALIFYING,
  ROUND_ROBIN,
  SINGLE_ELIMINATION,
  WINNER,
} from '@Constants/drawDefinitionConstants';
import { POLICY_TYPE_SCORING } from '@Constants/policyConstants';

it.each([ROUND_ROBIN, SINGLE_ELIMINATION, undefined])('will generate a drawDefinition with no matchUps', (drawType) => {
  const result = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 0, drawType }],
  });

  expect(result.error).toEqual(INVALID_DRAW_SIZE);
});

it('can generate QUALIFYING structures when no MAIN structure is specified', () => {
  let notificationsOrder: any[] = [];
  const allMatchUps: any[] = [];

  const subscriptions = {
    [ADD_MATCHUPS]: (payload) => {
      if (Array.isArray(payload)) {
        notificationsOrder.push(ADD_MATCHUPS);
        payload.forEach(({ matchUps }) => {
          allMatchUps.push(...matchUps);
        });
      }
    },
    [DELETED_MATCHUP_IDS]: (payload) => {
      if (Array.isArray(payload)) {
        notificationsOrder.push(DELETED_MATCHUP_IDS);
      }
    },
  };

  setSubscriptions({ subscriptions });

  let result = mocksEngine.generateTournamentRecord({
    setState: true,
    drawProfiles: [
      {
        ignoreDefaults: true,
        qualifyingProfiles: [
          {
            roundTarget: 1,
            structureProfiles: [{ stageSequence: 1, drawSize: 16, qualifyingRoundNumber: 2 }],
          },
        ],
      },
    ],
  });

  const {
    drawIds: [drawId],
  } = result;
  const eventResult = tournamentEngine.devContext(true).getEvent({ drawId });
  let drawDefinition = eventResult.drawDefinition;
  const event = eventResult.event;
  expect(drawDefinition.entries.length).toEqual(16);
  expect(event.entries.length).toEqual(16);
  let { matchUps } = tournamentEngine.allDrawMatchUps({ drawId });
  expect(matchUps.length).toEqual(12);
  expect(allMatchUps.length).toEqual(12);

  const entryStages = unique(event.entries.map(({ entryStage }) => entryStage));
  expect(entryStages).toEqual([QUALIFYING]);

  const mainStructure = drawDefinition.structures.find(({ stage }) => stage === MAIN);
  expect(mainStructure.matchUps.length).toEqual(0);

  const qualifyingStructure = drawDefinition.structures.find(({ stage }) => stage === QUALIFYING);
  expect(qualifyingStructure.matchUps.length).toEqual(12);

  const links = drawDefinition.links;
  expect(links.length).toEqual(1);
  expect(links[0].linkType).toEqual(WINNER);

  expect(links[0].source.structureId).toEqual(qualifyingStructure.structureId);

  expect(links[0].target.feedProfile).toEqual(DRAW);
  expect(links[0].target.structureId).toEqual(mainStructure.structureId);
  expect(links[0].target.roundNumber).toEqual(1);

  const structureIds = drawDefinition.structures.map(({ structureId }) => structureId);
  result = tournamentEngine.generateDrawTypeAndModifyDrawDefinition({
    modifyOriginal: false,
    drawSize: 32,
    drawId,
  });
  expect(result.success).toEqual(true);
  expect(result.drawDefinition.links.length).toEqual(1);
  expect(allMatchUps.length).toEqual(12);

  // check that structureIds have not changed
  expect(result.drawDefinition.structures.map(({ structureId }) => structureId)).toEqual(structureIds);

  // check that number of matchUps has not changed in state
  drawDefinition = tournamentEngine.getEvent({ drawId }).drawDefinition;
  matchUps = tournamentEngine.allDrawMatchUps({ drawDefinition }).matchUps;
  expect(matchUps.length).toEqual(12);

  // check that result.drawDefinition has more matchUps
  matchUps = tournamentEngine.allDrawMatchUps({
    drawDefinition: result.drawDefinition,
  }).matchUps;
  expect(matchUps.length).toBeGreaterThan(12);

  expect(drawDefinition.structures[1].matchUps.length).toEqual(0);
  expect(result.drawDefinition.structures[1].matchUps.length).toEqual(31);

  result = tournamentEngine.generateDrawDefinition({
    drawSize: 32,
    drawId,
  });
  expect(result.success).toEqual(true);

  result = tournamentEngine.getEvent({ drawId });
  expect(result.drawDefinition.links.length).toEqual(1);

  result = tournamentEngine.addDrawDefinition({
    drawDefinition: result.drawDefinition,
    eventId: event.eventId,
  });
  expect(result.error).toEqual(DRAW_ID_EXISTS);

  result = tournamentEngine.generateDrawDefinition({
    drawSize: 32,
    drawId,
  });
  expect(result.success).toEqual(true);

  expect(notificationsOrder).toEqual([ADD_MATCHUPS]);
  notificationsOrder = [];

  result = tournamentEngine.addDrawDefinition({
    drawDefinition: result.drawDefinition,
    allowReplacement: true,
    eventId: event.eventId,
  });
  expect(result.success).toEqual(true);
  // this is 12 from the original QUALIFYING structure generation
  // then 31 for the added MAIN structure
  // and 12 again because replacing an existing drawDefinition deletes all existing matchUps before replacing
  // this is due to how subscriptions are implmented on a back end that relies on storage systems such as Mongo
  expect(allMatchUps.length).toEqual(55);

  result = tournamentEngine.getEvent({ drawId });
  expect(result.drawDefinition.links.length).toEqual(1);

  const { eventData } = tournamentEngine.getEventData({ drawId });
  expect(eventData.drawsData.length).toEqual(1);
  expect(eventData.drawsData[0].structures.length).toEqual(2);

  expect(notificationsOrder).toEqual([DELETED_MATCHUP_IDS, ADD_MATCHUPS]);
});

it.each([
  { drawType: FEED_IN_CHAMPIONSHIP, linksCount: 6, structuresCount: 3 },
  { drawType: SINGLE_ELIMINATION, linksCount: 1, structuresCount: 2 },
  { drawType: COMPASS, linksCount: 8, structuresCount: 9 },
  { drawType: CURTIS, linksCount: 5, structuresCount: 4 },
])(
  'can generate QUALIFYING structures followed by various MAIN drawTypes',
  ({ drawType, linksCount, structuresCount }) => {
    let result = mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          ignoreDefaults: true,
          qualifyingProfiles: [
            {
              roundTarget: 1,
              structureProfiles: [
                {
                  stageSequence: 1,
                  drawSize: 16,
                  qualifyingRoundNumber: 2,
                  matchUpFormat: 'SET3-S:6/TB7-F:TB10',
                },
              ],
            },
          ],
        },
      ],
    });

    const {
      tournamentRecord,
      eventIds: [eventId],
      drawIds: [drawId],
    } = result;

    tournamentEngine.setState(tournamentRecord);
    const { drawDefinition, event } = tournamentEngine.getEvent({ drawId });
    const mainStructure = drawDefinition.structures.find(({ stage }) => stage === MAIN);
    expect(mainStructure.matchUps.length).toEqual(0);

    const qualifyingStructure = drawDefinition.structures.find(({ stage }) => stage === QUALIFYING);
    expect(qualifyingStructure.matchUpFormat).not.toBeUndefined();
    expect(qualifyingStructure.matchUps.length).toEqual(12);

    result = tournamentEngine.generateDrawDefinition({
      drawSize: 32,
      drawType,
      drawId,
    });
    expect(result.success).toEqual(true);

    expect(result.drawDefinition.drawType).toEqual(drawType);

    result = tournamentEngine.addDrawDefinition({
      drawDefinition: result.drawDefinition,
      allowReplacement: true,
      eventId: event.eventId,
    });
    expect(result.success).toEqual(true);

    result = tournamentEngine.getEvent({ drawId });
    expect(result.drawDefinition.links.length).toEqual(linksCount);

    result = tournamentEngine.getEventData({ eventId });
    expect(result.success).toEqual(true);
    expect(result.eventData.drawsData[0].structures?.length).toEqual(structuresCount);
  },
);

it('can generate only qualifying structure for eventType: TEAM', () => {
  const policyDefinitions = { [POLICY_TYPE_SCORING]: { requireParticipantsForScoring: false } };
  let result = mocksEngine.generateTournamentRecord({
    completeAllMatchUps: true,
    policyDefinitions,
    drawProfiles: [
      {
        eventType: TEAM_EVENT,
        tieFormatName: DOMINANT_DUO,
        ignoreDefaults: true, // do not use defaults for main structure
        qualifyingProfiles: [
          {
            roundTarget: 1,
            structureProfiles: [{ stageSequence: 1, drawSize: 16, qualifyingRoundNumber: 2 }],
          },
        ],
      },
    ],
  });

  const {
    tournamentRecord,
    drawIds: [drawId],
  } = result;

  result = tournamentEngine.setState(tournamentRecord);
  expect(result.success).toEqual(true);
  const { event, drawDefinition } = tournamentEngine.getEvent({ drawId });
  expect(event.entries.length).toEqual(16);

  const [qualifying, main] = drawDefinition.structures;
  expect(qualifying.matchUps.length).toEqual(12);
  expect(main.matchUps.length).toEqual(0);

  const { completedMatchUps } = tournamentEngine.tournamentMatchUps();
  // 12 team matchUps w/ 2 SINGLES 1 DOUBLES each => 48
  expect(completedMatchUps.length).toEqual(48);

  const { participants } = tournamentEngine.getParticipants();
  const teamParticipants = participants.filter(({ participantType }) => participantType === TEAM);
  expect(teamParticipants.length).toEqual(16);
  const individualParticipants = participants.filter(({ participantType }) => participantType === INDIVIDUAL);
  expect(individualParticipants.length).toEqual(32);
  const pairParticipants = participants.filter(({ participantType }) => participantType === PAIR);
  expect(pairParticipants.length).toEqual(16);
});
